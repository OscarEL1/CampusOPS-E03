import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { request } from 'node:http';

import { createCampusOpsApp } from '../src/app/composition';
import type { SessionStore, StoredSession } from '../src/campusops/domain/sessionStore';
import type { FetchLike } from '../src/campusops/infrastructure/remote/httpIncidentGateway';

/**
 * Week 06 integration against the course backend, started on an ephemeral
 * local port. The app is built by the real composition root; only the store
 * (in memory instead of the keychain), the clock and the transport (node:http,
 * because the Jest fetch is the React Native polyfill) are substituted.
 * Tokens are the public fixtures of the simulator: login returns
 * course-valid-token + course-refresh-0, and the refresh endpoint accepts
 * course-refresh-0 only, returning course-refresh-1.
 */

let server: ChildProcessWithoutNullStreams;
let baseUrl = '';

type Call = Readonly<{ method: string; path: string; status: number }>;

function transport(calls: Call[]): FetchLike {
  return (url, init) =>
    new Promise((resolve, reject) => {
      const outgoing = request(url, { method: init.method, headers: init.headers, signal: init.signal }, (incoming) => {
        const chunks: Buffer[] = [];
        incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
        incoming.on('error', reject);
        incoming.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          calls.push({ method: init.method, path: new URL(url).pathname, status: incoming.statusCode ?? 0 });
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
}

function memoryStore(initial: StoredSession | null = null) {
  let current = initial;
  const store: SessionStore = {
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
  return { store, current: () => current };
}

function manualClock(start = 5_000_000) {
  let time = start;
  return { now: () => time, advance: (ms: number) => (time += ms) };
}

function build(initial: StoredSession | null = null) {
  const calls: Call[] = [];
  const storage = memoryStore(initial);
  const clock = manualClock();
  const app = createCampusOpsApp(storage.store, { baseUrl, fetchImpl: transport(calls), clock });
  return { app, calls, storage, clock };
}

const count = (calls: readonly Call[], path: string, status?: number) =>
  calls.filter((call) => call.path === path && (status === undefined || call.status === status)).length;

/** A persisted session whose access token the server no longer accepts. */
function expiredSession(refreshToken: string): StoredSession {
  return {
    actorId: 'reporter-1',
    role: 'reporter',
    accessToken: 'course-expired-token',
    refreshToken,
    expiresAt: 9_000_000,
    generation: 4,
  };
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
    server.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`the course backend exited with ${String(code)}`));
    });
  });
}, 20000);

afterAll(() => {
  server.kill();
});

test('login with a fixture actor persists the session and the backend accepts its token', async () => {
  const { app, storage } = build();
  await app.session.restore();
  await expect(app.session.login('technician-1')).resolves.toEqual({ ok: true, actor: { id: 'technician-1', role: 'technician' } });
  expect(storage.current()).toMatchObject({ actorId: 'technician-1', role: 'technician', generation: 1 });

  const listed = await app.remoteIncidentsFor({ id: 'technician-1', role: 'technician' }).list();
  expect(listed.ok && listed.value.map((item) => (item.kind === 'available' ? item.incident.id : null))).toContain('campus-inc-001');
});

test('an unknown actor is refused by the backend and no session is stored', async () => {
  const { app, storage } = build();
  await app.session.restore();
  await expect(app.session.login('not-a-fixture-actor')).resolves.toEqual({ ok: false, failure: { kind: 'rejected' } });
  expect(storage.current()).toBeNull();
  expect(app.session.snapshot().status).toBe('anonymous');
});

test('three operations get 401 together: one real refresh, one retry each, all succeed', async () => {
  const { app, calls, storage } = build(expiredSession('course-refresh-0'));
  await app.session.restore();
  const incidents = app.remoteIncidentsFor({ id: 'reporter-1', role: 'reporter' });

  const [list, detail, created] = await Promise.all([
    incidents.list(),
    incidents.get('campus-inc-001'),
    incidents.create({ category: 'water', description: 'Fuga ficticia de sesión', location: 'Aula de prueba 6' }, 'week06-session-0001'),
  ]);

  expect([list.ok, detail.ok, created.ok]).toEqual([true, true, true]);
  expect(count(calls, '/v1/session/refresh')).toBe(1);
  expect(calls.filter((call) => call.status === 401)).toHaveLength(3);
  expect(calls.filter((call) => call.path.startsWith('/v1/incidents'))).toHaveLength(6);
  expect(storage.current()).toMatchObject({ accessToken: 'course-valid-token', refreshToken: 'course-refresh-1', generation: 5 });
  expect(app.session.snapshot().status).toBe('authenticated');
});

test('an expired token by the clock is renewed before sending, with no 401 at all', async () => {
  const { app, calls, clock } = build();
  await app.session.restore();
  await app.session.login('reporter-1');
  clock.advance(61_000);

  const incidents = app.remoteIncidentsFor({ id: 'reporter-1', role: 'reporter' });
  const results = await Promise.all([incidents.list(), incidents.list(), incidents.get('campus-inc-001')]);

  expect(results.every((result) => result.ok)).toBe(true);
  expect(count(calls, '/v1/session/refresh', 200)).toBe(1);
  expect(calls.filter((call) => call.status === 401)).toHaveLength(0);
});

test('a refused refresh returns to anonymous, deletes the session and does not loop', async () => {
  const { app, calls, storage } = build(expiredSession('course-refresh-revoked'));
  await app.session.restore();
  const incidents = app.remoteIncidentsFor({ id: 'reporter-1', role: 'reporter' });

  const results = await Promise.all([incidents.list(), incidents.get('campus-inc-001'), incidents.list()]);

  expect(results).toEqual([
    { ok: false, failure: { kind: 'unauthorized' } },
    { ok: false, failure: { kind: 'unauthorized' } },
    { ok: false, failure: { kind: 'unauthorized' } },
  ]);
  expect(count(calls, '/v1/session/refresh')).toBe(1);
  expect(calls.filter((call) => call.path.startsWith('/v1/incidents'))).toHaveLength(3);
  expect(storage.current()).toBeNull();
  expect(app.session.snapshot()).toEqual({ status: 'anonymous', actor: null });

  await expect(incidents.list()).resolves.toEqual({ ok: false, failure: { kind: 'unauthorized' } });
  expect(calls.filter((call) => call.path.startsWith('/v1/incidents'))).toHaveLength(3);
});

test('logout removes the persisted session and the next request is not sent', async () => {
  const { app, calls, storage } = build();
  await app.session.restore();
  await app.session.login('coordinator-1');
  expect(storage.current()).not.toBeNull();

  await app.session.logout();
  expect(storage.current()).toBeNull();
  const before = calls.length;
  await expect(app.remoteIncidentsFor({ id: 'coordinator-1', role: 'coordinator' }).list()).resolves.toEqual({
    ok: false,
    failure: { kind: 'unauthorized' },
  });
  expect(calls).toHaveLength(before);
});
