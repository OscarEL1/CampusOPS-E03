import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { request } from 'node:http';

import { createCampusOpsApp } from '../src/app/composition';
import { createLocationCache, createLocationLookup } from '../src/campusops/application/locationLookup';
import { newIdempotencyKey } from '../src/campusops/application/remoteIncidentQueries';
import type { CampusActor } from '../src/campusops/domain/accessPolicy';
import type { Incident } from '../src/campusops/domain/incident';
import type { RetryLimits } from '../src/campusops/domain/retryPolicy';
import type { SessionStore, StoredSession } from '../src/campusops/domain/sessionStore';
import { createCourseGeocodingProvider } from '../src/campusops/infrastructure/remote/geocodingProviders';
import { createHttpIncidentGateway, type FetchLike, type HttpRequest } from '../src/campusops/infrastructure/remote/httpIncidentGateway';

/**
 * Week 09 fault injection against the course backend on an ephemeral local
 * port: every published variant of the geocoding double, and a resolution, a
 * close and an evidence reference whose answer is lost after the server saved
 * it. Waits go through a recording sleep, so the planned delays are observed
 * exactly without slowing the suite; one case waits for real to measure time.
 * Set CAMPUSOPS_RESILIENCE_METRICS to a file path to keep the observations.
 */

let server: ChildProcessWithoutNullStreams;
let baseUrl = '';
const metrics: Record<string, unknown> = {};

/** Recorded when the request is sent; `status` stays null when no answer arrives (cut by the client deadline). */
type Sent = { method: string; path: string; status: number | null; body: string | undefined; key: string | undefined };

function transport(sent: Sent[], network = { online: true }): FetchLike {
  return (url, init: HttpRequest) =>
    new Promise((resolve, reject) => {
      if (!network.online) {
        reject(new Error('no connection'));
        return;
      }
      const record: Sent = {
        method: init.method,
        path: new URL(url).pathname,
        status: null,
        body: init.body,
        key: init.headers['Idempotency-Key'],
      };
      sent.push(record);
      const outgoing = request(url, { method: init.method, headers: init.headers, signal: init.signal }, (incoming) => {
        const chunks: Buffer[] = [];
        incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
        incoming.on('error', reject);
        incoming.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          record.status = incoming.statusCode ?? 0;
          resolve({
            status: incoming.statusCode ?? 0,
            headers: {
              get: (name: string) => {
                const value = incoming.headers[name.toLowerCase()];
                return Array.isArray(value) ? value.join(', ') : (value ?? null);
              },
            },
            text: async () => text,
          });
        });
      });
      outgoing.on('error', reject);
      if (init.body !== undefined) {
        outgoing.write(init.body);
      }
      outgoing.end();
    });
}

function memorySessionStore(): SessionStore {
  let current: StoredSession | null = null;
  return {
    async save(session) {
      current = session;
    },
    async read() {
      return current;
    },
    async clear() {
      current = null;
    },
  };
}

/** Records the waits the policy asks for instead of sleeping them. */
function recordingSleep() {
  const waits: number[] = [];
  return { waits, sleep: async (ms: number) => void waits.push(ms) };
}

async function signedIn(actor: CampusActor) {
  const sent: Sent[] = [];
  const app = createCampusOpsApp(memorySessionStore(), { baseUrl, fetchImpl: transport(sent) });
  await app.session.restore();
  expect((await app.session.login(actor.id)).ok).toBe(true);
  return { app, sent };
}

function serverCopy(id: string): Promise<{ version: number; status: string; payload: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const outgoing = request(
      `${baseUrl}/v1/incidents/${id}`,
      { method: 'GET', headers: { Authorization: 'Bearer course-valid-token', 'X-Course-Actor': 'coordinator-1' } },
      (incoming) => {
        const chunks: Buffer[] = [];
        incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
        incoming.on('end', () => resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))));
      },
    );
    outgoing.on('error', reject);
    outgoing.end();
  });
}

const TECHNICIAN: CampusActor = { id: 'technician-1', role: 'technician' };
const COORDINATOR: CampusActor = { id: 'coordinator-1', role: 'coordinator' };
const REPORTER: CampusActor = { id: 'reporter-1', role: 'reporter' };

let technician: Awaited<ReturnType<typeof signedIn>>;
let coordinator: Awaited<ReturnType<typeof signedIn>>;
let reporter: Awaited<ReturnType<typeof signedIn>>;

/** A new incident assigned to technician-1 and already in progress: version 3. */
async function incidentInProgress(): Promise<Incident> {
  const created = await reporter.app
    .remoteIncidentsFor(REPORTER)
    .create({ category: 'electrical', description: 'Contacto ficticio sin energía', location: 'Taller de prueba 9' }, newIdempotencyKey());
  if (!created.ok || created.value.incident.kind !== 'available') throw new Error('not created');
  const assigned = await coordinator.app
    .incidentActionsFor(COORDINATOR)
    .act(created.value.incident.incident, 'assign', { technicianId: 'technician-1' }, 1, newIdempotencyKey());
  if (!assigned.ok || assigned.value.incident.kind !== 'available') throw new Error('not assigned');
  const started = await technician.app.incidentActionsFor(TECHNICIAN).act(assigned.value.incident.incident, 'start', {}, 2, newIdempotencyKey());
  if (!started.ok || started.value.incident.kind !== 'available') throw new Error('not started');
  return started.value.incident.incident;
}

beforeAll(async () => {
  server = spawn(process.execPath, ['course-backend/server.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, COURSE_BACKEND_HOST: '127.0.0.1', COURSE_BACKEND_PORT: '0' },
  });
  baseUrl = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('the course backend did not start')), 15000);
    server.stdout.on('data', (chunk: Buffer) => {
      const address = /listening at (http:\/\/\S+)/.exec(chunk.toString())?.[1];
      if (address !== undefined) {
        clearTimeout(timer);
        resolve(address);
      }
    });
  });
  [technician, coordinator, reporter] = await Promise.all([signedIn(TECHNICIAN), signedIn(COORDINATOR), signedIn(REPORTER)]);
}, 20000);

afterAll(() => {
  server.kill();
  const out = process.env.CAMPUSOPS_RESILIENCE_METRICS;
  if (out !== undefined && out.length > 0) {
    writeFileSync(out, `${JSON.stringify(metrics, null, 2)}\n`);
  }
});

describe('geocoding through the controlled double', () => {
  function geocoder(scenario: string, options: { timeoutMs?: number; online?: boolean } = {}) {
    const sent: Sent[] = [];
    const recorder = recordingSleep();
    const entries: Record<string, unknown>[] = [];
    const clock = { now: () => 0 };
    const provider = createCourseGeocodingProvider({
      baseUrl,
      session: technician.app.session,
      fetchImpl: transport(sent, { online: options.online ?? true }),
      scenario,
      timeoutMs: options.timeoutMs ?? 2000,
      retry: { sleep: recorder.sleep },
      log: (entry) => entries.push(entry as Record<string, unknown>),
    });
    const lookup = createLocationLookup({ provider, cache: createLocationCache({ clock }), clock });
    return { lookup, sent, waits: recorder.waits, entries };
  }

  function observe(name: string, run: ReturnType<typeof geocoder>, result: unknown) {
    metrics[`geocoding:${name}`] = {
      attempts: run.entries.length,
      httpResponses: run.sent.length,
      attemptLog: run.entries.map(({ attempt, outcome, status, nextDelayMs, durationMs }) => ({ attempt, outcome, status, nextDelayMs, durationMs })),
      plannedWaitsMs: run.waits,
      result,
    };
  }

  test('success: provider location with coordinates, then served from the cache without a request', async () => {
    const run = geocoder('success');
    const first = await run.lookup.lookup('Edificio de prueba A', 'Edificio A manual');
    const second = await run.lookup.lookup('edificio de prueba a', 'Edificio A manual');
    expect(first).toEqual({
      kind: 'resolved',
      location: { source: 'provider', label: 'Edificio de prueba A', latitude: 0, longitude: 0 },
      origin: 'provider',
      fallbackReason: null,
    });
    expect(second).toMatchObject({ origin: 'cache' });
    expect(run.sent).toHaveLength(1);
    expect(run.waits).toEqual([]);
    observe('success', run, { first: 'provider', second: 'cache' });
  });

  test.each([
    ['incomplete', 'invalid_data'],
    ['nullable', 'invalid_data'],
    ['invalid_coordinates', 'invalid_data'],
    ['malformed', 'invalid_response'],
  ])('%s data: the manual label is kept, no coordinates, no retry', async (scenario, reason) => {
    const run = geocoder(scenario);
    const result = await run.lookup.lookup('Edificio de prueba A', 'Edificio A, acceso norte');
    expect(result).toEqual({ kind: 'resolved', location: { source: 'manual', label: 'Edificio A, acceso norte' }, origin: 'manual', fallbackReason: reason });
    expect(run.sent).toHaveLength(1);
    expect(run.waits).toEqual([]);
    observe(scenario, run, result);
  });

  test('server error: retried with progressive waits, stops at the fourth attempt, then manual', async () => {
    const run = geocoder('server_error');
    const result = await run.lookup.lookup('Edificio de prueba A', 'Edificio A');
    expect(result).toMatchObject({ origin: 'manual', fallbackReason: 'server_error' });
    expect(run.sent.map((call) => call.status)).toEqual([500, 500, 500, 500]);
    expect(run.waits).toEqual([250, 500, 1000]);
    observe('server_error', run, result);
  });

  test('429: Retry-After of 1 s is honoured on every retry, at most 4 attempts, then manual', async () => {
    const run = geocoder('rate_limited');
    const result = await run.lookup.lookup('Edificio de prueba A', 'Edificio A');
    expect(result).toMatchObject({ origin: 'manual', fallbackReason: 'rate_limited' });
    expect(run.sent.map((call) => call.status)).toEqual([429, 429, 429, 429]);
    expect(run.waits).toEqual([1000, 1000, 1000]);
    observe('rate_limited', run, result);
  });

  test('timeout: a slow provider is cut by the client deadline, retried, then manual', async () => {
    const run = geocoder('slow', { timeoutMs: 300 });
    const result = await run.lookup.lookup('Edificio de prueba A', 'Edificio A');
    expect(result).toMatchObject({ origin: 'manual', fallbackReason: 'timeout' });
    expect(run.entries.map((entry) => entry.outcome)).toEqual(['timeout', 'timeout', 'timeout', 'timeout']);
    expect(run.waits).toEqual([250, 500, 1000]);
    for (const entry of run.entries) {
      expect(entry.durationMs as number).toBeLessThan(1000);
    }
    observe('timeout', run, result);
  }, 15000);

  test('disconnection: not retried, the manual label is used at once', async () => {
    const run = geocoder('success', { online: false });
    const result = await run.lookup.lookup('Edificio de prueba A', 'Edificio A');
    expect(result).toMatchObject({ origin: 'manual', fallbackReason: 'network' });
    expect(run.entries.map((entry) => entry.outcome)).toEqual(['network']);
    expect(run.waits).toEqual([]);
    observe('network', run, result);
  });

  test('no manual label and no provider: the app asks for one instead of inventing a location', async () => {
    const run = geocoder('success', { online: false });
    await expect(run.lookup.lookup('Edificio de prueba A', '')).resolves.toEqual({ kind: 'manual_required', fallbackReason: 'network' });
  });

  test('attempt logs are sanitised: no token, actor, query or coordinates', async () => {
    const run = geocoder('server_error');
    await run.lookup.lookup('Consulta ficticia privada', 'Manual');
    const text = JSON.stringify(run.entries);
    for (const secret of ['course-valid-token', 'Bearer', 'technician-1', 'Consulta ficticia', 'latitude']) {
      expect(text).not.toContain(secret);
    }
  });
});

describe('a lost answer after the server saved the change', () => {
  function lossyGateway(actorApp: Awaited<ReturnType<typeof signedIn>>, sent: Sent[]) {
    const recorder = recordingSleep();
    const entries: Record<string, unknown>[] = [];
    const gateway = createHttpIncidentGateway({
      baseUrl,
      session: actorApp.app.session,
      fetchImpl: transport(sent),
      scenario: 'timeout_after_commit',
      timeoutMs: 400,
      retry: { sleep: recorder.sleep },
      log: (entry) => entries.push(entry as Record<string, unknown>),
    });
    return { gateway, waits: recorder.waits, entries };
  }

  async function lostAnswer(
    name: string,
    actorApp: Awaited<ReturnType<typeof signedIn>>,
    incident: Incident,
    action: 'resolve' | 'close' | 'add_evidence',
    input: Record<string, string>,
  ) {
    const before = await serverCopy(incident.id);
    const sent: Sent[] = [];
    const run = lossyGateway(actorApp, sent);
    const key = newIdempotencyKey();
    const result = await run.gateway.act(incident.id, action, input, before.version, key);
    const after = await serverCopy(incident.id);
    const history = (after.payload.history as { operationId: string; action: string }[]).filter((entry) => entry.operationId === key);
    const posts = sent.filter((call) => call.method === 'POST');
    metrics[`lost-answer:${name}`] = {
      attempts: run.entries.map(({ attempt, outcome, durationMs, nextDelayMs }) => ({ attempt, outcome, durationMs, nextDelayMs })),
      plannedWaitsMs: run.waits,
      postStatuses: posts.map((call) => call.status),
      postsWithSameKeyAndBody: posts.filter((call) => call.key === key && call.body === posts[0]?.body).length,
      historyEntriesForKey: history.length,
      versionBefore: before.version,
      versionAfter: after.version,
      duplicateAnswer: result.ok ? result.value.duplicate : null,
    };
    return { result, before, after, history, posts, key, run };
  }

  test('resolution: the retry repeats the same key and body, the server answers duplicate and applies it once', async () => {
    const incident = await incidentInProgress();
    const { result, before, after, history, posts, key, run } = await lostAnswer('resolve', technician, incident, 'resolve', {
      diagnosis: 'Diagnóstico ficticio: interruptor dañado',
    });
    expect(result).toMatchObject({ ok: true, value: { duplicate: true } });
    // The first answer never arrives (the server saved, the client cut it at 400 ms); the retry gets 200.
    expect(posts.map((call) => call.status)).toEqual([null, 200]);
    expect(posts.every((call) => call.key === key && call.body === posts[0]?.body)).toBe(true);
    expect(run.entries.map((entry) => entry.outcome)).toEqual(['timeout', 'ok']);
    expect(run.waits).toEqual([250]);
    expect(history).toEqual([expect.objectContaining({ action: 'resolve' })]);
    expect(after).toMatchObject({ status: 'resolved', version: before.version + 1, payload: { diagnosis: 'Diagnóstico ficticio: interruptor dañado' } });
  });

  test('close by coordination: one close event in the history despite the lost answer', async () => {
    const incident = await incidentInProgress();
    const resolved = await technician.app
      .incidentActionsFor(TECHNICIAN)
      .act(incident, 'resolve', { diagnosis: 'Diagnóstico ficticio previo' }, 3, newIdempotencyKey());
    expect(resolved.ok).toBe(true);
    const { result, before, after, history } = await lostAnswer('close', coordinator, incident, 'close', {});
    expect(result).toMatchObject({ ok: true, value: { duplicate: true } });
    expect(history).toEqual([expect.objectContaining({ action: 'close' })]);
    expect(after).toMatchObject({ status: 'closed', version: before.version + 1 });
  });

  test('evidence reference: the same photo reference is stored once', async () => {
    const incident = await incidentInProgress();
    const { result, after, history } = await lostAnswer('add_evidence', technician, incident, 'add_evidence', {
      evidenceId: 'photo-ref-week09-0001',
    });
    expect(result).toMatchObject({ ok: true, value: { duplicate: true } });
    expect(after.payload.evidence).toEqual([{ actorId: 'technician-1', evidenceId: 'photo-ref-week09-0001' }]);
    expect(history).toHaveLength(1);
  });

  test('creation: a lost answer is retried with the same key and leaves exactly one incident', async () => {
    const sent: Sent[] = [];
    const recorder = recordingSleep();
    const gateway = createHttpIncidentGateway({
      baseUrl,
      session: reporter.app.session,
      fetchImpl: transport(sent),
      scenario: 'timeout_after_commit',
      timeoutMs: 400,
      retry: { sleep: recorder.sleep },
    });
    const description = `Fuga ficticia con respuesta perdida ${newIdempotencyKey()}`;
    const key = newIdempotencyKey();
    const result = await gateway.create({ category: 'water', description, location: 'Aula de prueba 9' }, key);
    expect(result).toMatchObject({ ok: true, value: { duplicate: true } });
    expect(sent.map((call) => [call.status, call.key])).toEqual([[null, key], [200, key]]);
    const listed = await reporter.app.remoteIncidentsFor(REPORTER).list();
    const copies = listed.ok
      ? listed.value.filter((item) => item.kind === 'available' && item.incident.description === description)
      : [];
    expect(copies).toHaveLength(1);
    metrics['lost-answer:create'] = { postStatuses: sent.map((call) => call.status), sameKey: sent.every((call) => call.key === key), plannedWaitsMs: recorder.waits, incidentsWithThatDescription: copies.length };
  });

  test('a POST that keeps failing is repeated only with its key, at most 4 times, and creates nothing', async () => {
    const sent: Sent[] = [];
    const recorder = recordingSleep();
    const gateway = createHttpIncidentGateway({
      baseUrl,
      session: reporter.app.session,
      fetchImpl: transport(sent),
      scenario: 'server_error',
      retry: { sleep: recorder.sleep },
    });
    const listed = await reporter.app.remoteIncidentsFor(REPORTER).list();
    const before = listed.ok ? listed.value.length : -1;
    const key = newIdempotencyKey();
    const result = await gateway.create({ category: 'water', description: 'Fuga ficticia', location: 'Aula 9' }, key);
    expect(result).toEqual({ ok: false, failure: { kind: 'server_error', status: 500 } });
    expect(sent.map((call) => [call.status, call.key])).toEqual([[500, key], [500, key], [500, key], [500, key]]);
    expect(recorder.waits).toEqual([250, 500, 1000]);
    const after = await reporter.app.remoteIncidentsFor(REPORTER).list();
    expect(after.ok ? after.value.length : -2).toBe(before);
    metrics['post-server-error'] = { attempts: sent.length, sameKey: sent.every((call) => call.key === key), plannedWaitsMs: recorder.waits, incidentsCreated: 0 };
  });

  test('real waits: the observed time between attempts is at least the planned wait and stays bounded', async () => {
    const sent: Sent[] = [];
    const limits: RetryLimits = { maxAttempts: 4, baseDelayMs: 40, maxDelayMs: 160, maxRetryAfterMs: 1000 };
    const times: number[] = [];
    const gateway = createHttpIncidentGateway({
      baseUrl,
      session: technician.app.session,
      fetchImpl: (url, init) => {
        times.push(Date.now());
        return transport(sent)(url, init);
      },
      scenario: 'server_error',
      retry: { limits },
    });
    const started = Date.now();
    const result = await gateway.list();
    const elapsed = Date.now() - started;
    expect(result).toEqual({ ok: false, failure: { kind: 'server_error', status: 500 } });
    const gaps = times.slice(1).map((time, index) => time - (times[index] ?? time));
    expect(gaps).toHaveLength(3);
    [40, 80, 160].forEach((planned, index) => expect(gaps[index]).toBeGreaterThanOrEqual(planned - 5));
    expect(elapsed).toBeLessThan(5000);
    metrics['real-waits'] = { limits, plannedWaitsMs: [40, 80, 160], observedGapsMs: gaps, totalElapsedMs: elapsed };
  });

  test('without retry configured the client keeps the week 05 behaviour: one attempt', async () => {
    const sent: Sent[] = [];
    const gateway = createHttpIncidentGateway({ baseUrl, session: technician.app.session, fetchImpl: transport(sent), scenario: 'server_error' });
    await expect(gateway.list()).resolves.toEqual({ ok: false, failure: { kind: 'server_error', status: 500 } });
    expect(sent).toHaveLength(1);
  });
});
