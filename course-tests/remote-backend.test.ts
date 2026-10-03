import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { request } from 'node:http';

import { createRemoteIncidentQueries } from '../src/campusops/application/remoteIncidentQueries';
import type { NewIncident } from '../src/campusops/domain/incidentGateway';
import { createHttpIncidentGateway, type FetchLike } from '../src/campusops/infrastructure/remote/httpIncidentGateway';

/**
 * Week 05 integration against the course backend itself, started on an
 * ephemeral local port for this file and stopped afterwards. Each published
 * variant is selected with X-Course-Scenario. Nothing leaves 127.0.0.1 and no
 * real provider is involved.
 */

// Public fixture of the local course simulator, documented in docs/CAMPUSOPS_API.md.
const FIXTURE_TOKEN = 'course-valid-token';

let server: ChildProcessWithoutNullStreams;
let baseUrl = '';

/**
 * Real HTTP over loopback with node:http. The global fetch inside Jest is the
 * React Native polyfill, which never reaches a server and resolves with an
 * undefined status, so it cannot exercise the backend. The app itself uses the
 * platform fetch; this only replaces the transport under test.
 */
const fetchImpl: FetchLike = (url, init) =>
  new Promise((resolve, reject) => {
    const outgoing = request(url, { method: init.method, headers: init.headers, signal: init.signal }, (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
      incoming.on('error', reject);
      incoming.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve({
          status: incoming.statusCode ?? 0,
          headers: {
            get: (name: string) => {
              const value = incoming.headers[name.toLowerCase()];
              return Array.isArray(value) ? value.join(', ') : (value ?? null);
            },
          },
          text: async () => body,
        });
      });
    });
    outgoing.on('error', reject);
    if (init.body !== undefined) {
      outgoing.write(init.body);
    }
    outgoing.end();
  });

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
    server.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`the course backend exited with ${String(code)}`));
    });
  });
}, 20000);

afterAll(() => {
  server.kill();
});

type ClientOptions = Readonly<{ scenario?: string; timeoutMs?: number; actorId?: string; accessToken?: string }>;

function client(options: ClientOptions = {}) {
  return createHttpIncidentGateway({
    baseUrl,
    accessToken: options.accessToken ?? FIXTURE_TOKEN,
    actorId: options.actorId ?? 'reporter-1',
    fetchImpl,
    timeoutMs: options.timeoutMs ?? 5000,
    ...(options.scenario === undefined ? {} : { scenario: options.scenario }),
  });
}

const DRAFT: NewIncident = {
  category: 'water',
  description: 'Fuga ficticia en sanitarios de prueba',
  location: 'Edificio de prueba B',
};

describe('published backend variants', () => {
  test('success: the reporter sees the seeded incident as available', async () => {
    const result = await client().list();
    expect(result.ok).toBe(true);
    const seeded = result.ok ? result.value.find((item) => item.kind === 'available' && item.incident.id === 'campus-inc-001') : undefined;
    expect(seeded).toMatchObject({
      kind: 'available',
      version: 1,
      incident: { id: 'campus-inc-001', category: 'connectivity', status: 'assigned', reporterId: 'reporter-1' },
    });
  });

  test('nullable: the same incident arrives withheld, with nothing invented', async () => {
    const result = await client({ scenario: 'nullable' }).list();
    expect(result).toEqual({
      ok: true,
      value: [{ kind: 'withheld', summary: { id: 'campus-inc-001', version: 1, status: 'assigned' } }],
    });
  });

  test('malformed: invalid JSON from a 200 response is invalid_response', async () => {
    expect(await client({ scenario: 'malformed' }).list()).toEqual({
      ok: false,
      failure: { kind: 'invalid_response', reason: 'not_json' },
    });
  });

  test('server_error: a 500 is server_error', async () => {
    expect(await client({ scenario: 'server_error' }).list()).toEqual({
      ok: false,
      failure: { kind: 'server_error', status: 500 },
    });
  });

  test('rate_limited: a 429 carries the Retry-After the server sent', async () => {
    expect(await client({ scenario: 'rate_limited' }).list()).toEqual({
      ok: false,
      failure: { kind: 'rate_limited', retryAfterMs: 1000 },
    });
  });

  test('slow: a 1.2 s answer is a timeout for a 300 ms client and a success for a 5 s client', async () => {
    expect(await client({ scenario: 'slow', timeoutMs: 300 }).list()).toEqual({
      ok: false,
      failure: { kind: 'timeout', timeoutMs: 300 },
    });
    const patient = await client({ scenario: 'slow', timeoutMs: 5000 }).list();
    expect(patient.ok).toBe(true);
  });
});

describe('authorisation answers', () => {
  test('a wrong token is unauthorized', async () => {
    expect(await client({ accessToken: 'token-ficticio-invalido' }).list()).toEqual({
      ok: false,
      failure: { kind: 'unauthorized' },
    });
  });

  test("another reporter's incident is forbidden", async () => {
    expect(await client({ actorId: 'reporter-2' }).get('campus-inc-001')).toEqual({
      ok: false,
      failure: { kind: 'forbidden' },
    });
  });

  test('an unknown incident is not_found', async () => {
    expect(await client().get('campus-inc-999')).toEqual({ ok: false, failure: { kind: 'not_found' } });
  });

  test('the owner reads the detail', async () => {
    const result = await client().get('campus-inc-001');
    expect(result.ok && result.value.kind).toBe('available');
  });
});

describe('creating an incident', () => {
  test('a reporter creates an incident, and a replay of the same key is a duplicate', async () => {
    const first = await client().create(DRAFT, 'clave-integracion-0001');
    expect(first.ok).toBe(true);
    const created = first.ok && first.value.incident.kind === 'available' ? first.value.incident : null;
    expect(first.ok && first.value.duplicate).toBe(false);
    expect(created).toMatchObject({
      kind: 'available',
      version: 1,
      incident: { status: 'open', category: 'water', reporterId: 'reporter-1', assignedTechnicianId: null },
    });

    const replay = await client().create(DRAFT, 'clave-integracion-0001');
    expect(replay.ok && replay.value.duplicate).toBe(true);
    expect(replay.ok && replay.value.incident.kind === 'available' && replay.value.incident.incident.id).toBe(
      created?.incident.id,
    );
  });

  test('an invalid category is rejected with the server code', async () => {
    const result = await client().create({ ...DRAFT, category: 'plumbing' } as unknown as NewIncident, 'clave-integracion-0002');
    expect(result).toEqual({ ok: false, failure: { kind: 'rejected', status: 422, code: 'invalid_incident' } });
  });

  test('a technician cannot create', async () => {
    expect(await client({ actorId: 'technician-1' }).create(DRAFT, 'clave-integracion-0003')).toEqual({
      ok: false,
      failure: { kind: 'forbidden' },
    });
  });

  test('a response lost after commit: the client times out, and a retry with the same key replays instead of duplicating', async () => {
    const draft: NewIncident = { ...DRAFT, description: 'Fuga ficticia con respuesta perdida' };
    const lost = await client({ scenario: 'timeout_after_commit', timeoutMs: 400 }).create(draft, 'clave-integracion-0004');
    expect(lost).toEqual({ ok: false, failure: { kind: 'timeout', timeoutMs: 400 } });

    const retry = await client().create(draft, 'clave-integracion-0004');
    expect(retry.ok && retry.value.duplicate).toBe(true);

    const listed = await client().list();
    const matching = listed.ok
      ? listed.value.filter((item) => item.kind === 'available' && item.incident.description === draft.description)
      : [];
    expect(matching).toHaveLength(1);
  });
});

describe('application layer over the real backend', () => {
  test('the use case returns what this reporter may see', async () => {
    const queries = createRemoteIncidentQueries(client(), { id: 'reporter-1', role: 'reporter' });
    const result = await queries.list();
    expect(result.ok && result.value.some((item) => item.kind === 'available' && item.incident.id === 'campus-inc-001')).toBe(true);
  });

  test('records from real failures stay sanitised', async () => {
    const logs: unknown[] = [];
    for (const scenario of ['malformed', 'server_error', 'rate_limited']) {
      await createHttpIncidentGateway({
        baseUrl,
        accessToken: FIXTURE_TOKEN,
        actorId: 'reporter-1',
        fetchImpl,
        scenario,
        log: (entry) => logs.push(entry),
      }).list();
    }
    expect(logs).toHaveLength(3);
    const serialised = JSON.stringify(logs);
    for (const forbidden of [FIXTURE_TOKEN, 'reporter-1', '127.0.0.1', 'Sin conexión']) {
      expect(serialised).not.toContain(forbidden);
    }
  });
});
