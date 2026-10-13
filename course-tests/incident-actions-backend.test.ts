import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { request } from 'node:http';

import { createCampusOpsApp } from '../src/app/composition';
import type { SessionStore, StoredSession } from '../src/campusops/domain/sessionStore';
import {
  createHttpIncidentGateway,
  type FetchLike,
} from '../src/campusops/infrastructure/remote/httpIncidentGateway';

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
          calls.push({ method: init.method, path: new URL(url).pathname, status: incoming.statusCode ?? 0 });
          resolve({
            status: incoming.statusCode ?? 0,
            headers: {
              get: (name: string) => {
                const value = incoming.headers[name.toLowerCase()];
                return Array.isArray(value) ? value.join(', ') : (value ?? null);
              },
            },
            text: async () => Buffer.concat(chunks).toString('utf8'),
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

function memoryStore(): SessionStore {
  let value: StoredSession | null = null;
  return {
    async save(session) {
      value = session;
    },
    async read() {
      return value;
    },
    async clear() {
      value = null;
    },
  };
}

async function gatewayFor(actorId: string, calls: Call[]) {
  const fetchImpl = transport(calls);
  const app = createCampusOpsApp(memoryStore(), {
    baseUrl,
    fetchImpl,
    clock: { now: () => 5_000_000 },
  });
  await app.session.restore();
  const login = await app.session.login(actorId);
  if (!login.ok) {
    throw new Error(`Fixture login failed for ${actorId}`);
  }
  return createHttpIncidentGateway({ baseUrl, fetchImpl, session: app.session });
}

function availableStatus(result: Awaited<ReturnType<ReturnType<typeof createHttpIncidentGateway>['act']>>) {
  if (!result.ok || result.value.incident.kind !== 'available') {
    throw new Error('Expected an available incident');
  }
  return { status: result.value.incident.incident.status, version: result.value.incident.version };
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

test('the real backend returns 403 when the gateway bypasses the client policy', async () => {
  const calls: Call[] = [];
  const gateway = await gatewayFor('reporter-1', calls);

  await expect(gateway.act('campus-inc-001', 'start', {}, 1, 'bypass-policy-01')).resolves.toEqual({
    ok: false,
    failure: { kind: 'forbidden' },
  });
  expect(calls).toContainEqual({ method: 'POST', path: '/v1/incidents/campus-inc-001/actions', status: 403 });
});

test('a technician resolves and coordination closes and reopens against the real backend', async () => {
  const calls: Call[] = [];
  const technician = await gatewayFor('technician-1', calls);
  const started = await technician.act('campus-inc-001', 'start', {}, 1, 'start-operation-01');
  expect(availableStatus(started)).toEqual({ status: 'in_progress', version: 2 });

  const resolved = await technician.act(
    'campus-inc-001',
    'resolve',
    { diagnosis: 'DiagnÃ³stico ficticio verificado' },
    2,
    'resolve-operation-01',
  );
  expect(availableStatus(resolved)).toEqual({ status: 'resolved', version: 3 });

  const coordinator = await gatewayFor('coordinator-1', calls);
  const closed = await coordinator.act('campus-inc-001', 'close', {}, 3, 'close-operation-01');
  expect(availableStatus(closed)).toEqual({ status: 'closed', version: 4 });

  const reopened = await coordinator.act('campus-inc-001', 'reopen', {}, 4, 'reopen-operation-01');
  expect(availableStatus(reopened)).toEqual({ status: 'assigned', version: 5 });
});
