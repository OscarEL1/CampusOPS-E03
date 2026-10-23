import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { request } from 'node:http';

import { createCampusOpsApp } from '../src/app/composition';
import { newIdempotencyKey } from '../src/campusops/application/remoteIncidentQueries';
import { createSyncEngine } from '../src/campusops/application/syncEngine';
import type { CampusActor } from '../src/campusops/domain/accessPolicy';
import type { Incident } from '../src/campusops/domain/incident';
import type { SessionStore, StoredSession } from '../src/campusops/domain/sessionStore';
import { openOfflineStore } from '../src/campusops/infrastructure/local/sqliteOfflineStore';
import type { SqlDatabase } from '../src/campusops/infrastructure/local/sqlDatabase';
import { createHttpIncidentGateway, type FetchLike } from '../src/campusops/infrastructure/remote/httpIncidentGateway';
import { openNodeSqliteDatabase, temporaryDatabasePath } from './support/nodeSqliteDatabase';

/**
 * Week 08 end to end against the course backend on an ephemeral local port.
 * Each "device" is the real composition root with an in-memory session store,
 * a real SQLite file (node:sqlite) and a transport that can be switched
 * offline. Incidents and actors are the public fixtures; every test creates
 * its own incident so they do not share state.
 */

let server: ChildProcessWithoutNullStreams;
let baseUrl = '';

type Network = { online: boolean };
type Call = Readonly<{ method: string; path: string; status: number }>;

const TECHNICIAN: CampusActor = { id: 'technician-1', role: 'technician' };
const COORDINATOR: CampusActor = { id: 'coordinator-1', role: 'coordinator' };
const REPORTER: CampusActor = { id: 'reporter-1', role: 'reporter' };

function transport(network: Network, calls: Call[]): FetchLike {
  return (url, init) =>
    new Promise((resolve, reject) => {
      if (!network.online) {
        reject(new Error('no connection'));
        return;
      }
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

type Device = Awaited<ReturnType<typeof openDevice>>;

async function openDevice(
  actor: CampusActor,
  options: Readonly<{ dbPath?: string; network?: Network; sessionStore?: SessionStore }> = {},
) {
  const network = options.network ?? { online: true };
  const calls: Call[] = [];
  const db: SqlDatabase = openNodeSqliteDatabase(options.dbPath ?? ':memory:');
  const sessionStore = options.sessionStore ?? memorySessionStore();
  const app = createCampusOpsApp(sessionStore, { baseUrl, fetchImpl: transport(network, calls), database: db });
  const restored = await app.session.restore();
  if (restored.status !== 'authenticated') {
    const login = await app.session.login(actor.id);
    expect(login.ok).toBe(true);
  }
  const local = app.local();
  if (local === null) {
    throw new Error('local data did not open');
  }
  return { app, db, calls, network, sessionStore, local, work: local.offlineWorkFor(actor), sync: local.syncFor(actor) };
}

/** What the server holds, read raw as coordination, including fields the app's DTO does not copy. */
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

function historyOf(copy: { payload: Record<string, unknown> }, operationId: string) {
  return (copy.payload.history as { operationId: string; action: string }[]).filter((entry) => entry.operationId === operationId);
}

let coordinator: Device;

/** Reporter creates an incident and coordination assigns it to technician-1: version 2, assigned. */
async function assignedIncident(): Promise<Incident> {
  const reporter = await openDevice(REPORTER);
  const created = await reporter.app
    .remoteIncidentsFor(REPORTER)
    .create({ category: 'connectivity', description: 'Red ficticia caída', location: 'Laboratorio de prueba 8' }, newIdempotencyKey());
  if (!created.ok || created.value.incident.kind !== 'available') {
    throw new Error('incident not created');
  }
  const assigned = await coordinator.app
    .incidentActionsFor(COORDINATOR)
    .act(created.value.incident.incident, 'assign', { technicianId: 'technician-1' }, 1, newIdempotencyKey());
  if (!assigned.ok || assigned.value.incident.kind !== 'available') {
    throw new Error('incident not assigned');
  }
  return assigned.value.incident.incident;
}

async function coordinatorActs(incident: Incident, action: 'assign' | 'prioritize', input: Record<string, string>) {
  const current = await serverCopy(incident.id);
  const result = await coordinator.app.incidentActionsFor(COORDINATOR).act(incident, action, input, current.version, newIdempotencyKey());
  expect(result.ok).toBe(true);
}

/** The technician reads the incident while online, so the device holds its server copy. */
async function cacheWhileOnline(device: Device, id: string): Promise<void> {
  const read = await device.app.remoteIncidentsFor(TECHNICIAN).get(id);
  if (!read.ok) {
    throw new Error('incident not readable');
  }
  device.work.cache(read.value);
}

const actionCalls = (calls: readonly Call[]) => calls.filter((call) => call.method === 'POST' && call.path.endsWith('/actions'));

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
  coordinator = await openDevice(COORDINATOR);
}, 20000);

afterAll(() => {
  server.kill();
});

test('offline work survives closing the app and is sent once, in order, when the connection returns', async () => {
  const incident = await assignedIncident();
  const dbPath = temporaryDatabasePath();
  const network: Network = { online: true };
  const sessionStore = memorySessionStore();
  const first = await openDevice(TECHNICIAN, { dbPath, network, sessionStore });
  await cacheWhileOnline(first, incident.id);

  network.online = false;
  const queued = [
    first.work.startWork(incident.id),
    first.work.addNote(incident.id, 'Cable de red ficticio dañado'),
    first.work.addPhotoReference(incident.id, 'photo-ref-week08-0001'),
  ].map((result) => (result.ok ? result.operationId : 'not-queued'));
  const offline = await first.sync.sync();
  expect(offline).toMatchObject({ confirmed: [], stoppedBy: 'network', pending: queued });
  const beforeRestart = first.work.pending();
  first.db.close();

  // Reopen the app: same database file, same persisted session, still offline.
  const second = await openDevice(TECHNICIAN, { dbPath, network, sessionStore });
  // The persisted session is restored by its own rules: no new login was needed.
  expect(second.calls.filter((call) => call.path === '/v1/session/login')).toHaveLength(0);
  expect(second.app.session.snapshot()).toEqual({ status: 'authenticated', actor: TECHNICIAN });
  expect(second.local.schema).toEqual({ from: 2, to: 2, migratedIncidents: 0, migratedOperations: 0 });
  expect(second.work.pending()).toEqual(beforeRestart);
  expect(second.work.pending().map((operation) => [operation.operationId, operation.attempts])).toEqual([
    [queued[0], 1],
    [queued[1], 0],
    [queued[2], 0],
  ]);

  network.online = true;
  // Another technician signing in on the same device never sends technician-1's work.
  const other = await openDevice({ id: 'technician-2', role: 'technician' }, { dbPath });
  await expect(other.sync.sync()).resolves.toMatchObject({ confirmed: [], pending: [] });
  expect(actionCalls(other.calls)).toHaveLength(0);
  other.db.close();

  const report = await second.sync.sync();
  expect(report).toMatchObject({ confirmed: queued, conflicts: [], rejected: [], pending: [], stoppedBy: null });
  expect(second.work.pending()).toEqual([]);

  const copy = await serverCopy(incident.id);
  expect(copy).toMatchObject({ status: 'in_progress', version: 5 });
  expect(copy.payload.notes).toEqual([{ actorId: 'technician-1', text: 'Cable de red ficticio dañado' }]);
  expect(copy.payload.evidence).toEqual([{ actorId: 'technician-1', evidenceId: 'photo-ref-week08-0001' }]);
  for (const id of queued) {
    expect(historyOf(copy, id)).toHaveLength(1);
  }
  second.db.close();
});

test('offline start against a reassignment: conflict declared, both facts kept, no old assignment imposed', async () => {
  const incident = await assignedIncident();
  const network: Network = { online: true };
  const technician = await openDevice(TECHNICIAN, { network });
  await cacheWhileOnline(technician, incident.id);

  network.online = false;
  const start = technician.work.startWork(incident.id);
  const startId = start.ok ? start.operationId : '';
  await coordinatorActs(incident, 'assign', { technicianId: 'technician-2' });

  network.online = true;
  const report = await technician.sync.sync();
  expect(report).toMatchObject({ confirmed: [], conflicts: [startId], pending: [] });

  // The local intention is still queued, with its content and base.
  expect(technician.work.pending()).toEqual([
    expect.objectContaining({
      operationId: startId,
      content: { action: 'start' },
      baseVersion: 2,
      state: 'conflict',
      problem: { kind: 'conflict', reason: 'assignment_changed', fields: ['work'], remoteVersion: null },
    }),
  ]);
  expect(technician.work.view(incident.id)).toMatchObject({ hasConflict: true, localStatus: 'assigned' });

  // The remote reassignment stands, untouched.
  const remote = await serverCopy(incident.id);
  expect(remote).toMatchObject({ version: 3, status: 'assigned', payload: { assignedTechnicianId: 'technician-2' } });
  expect(historyOf(remote, startId)).toHaveLength(0);

  // A conflict waits for a decision: syncing again sends nothing.
  const sent = actionCalls(technician.calls).length;
  await expect(technician.sync.sync()).resolves.toMatchObject({ held: [startId], confirmed: [] });
  expect(actionCalls(technician.calls)).toHaveLength(sent);

  // Resolution: coordination gives the incident back, the technician decides to retry.
  await coordinatorActs(incident, 'assign', { technicianId: 'technician-1' });
  expect(technician.work.retry(startId)).toBe(true);
  const resolved = await technician.sync.sync();
  expect(resolved).toMatchObject({ rebased: [startId], confirmed: [startId], conflicts: [] });
  const final = await serverCopy(incident.id);
  expect(final).toMatchObject({ status: 'in_progress', payload: { assignedTechnicianId: 'technician-1' } });
  expect(historyOf(final, startId)).toHaveLength(1);
});

test('independent changes from the same base are combined: an offline note and a remote priority', async () => {
  const incident = await assignedIncident();
  const network: Network = { online: true };
  const technician = await openDevice(TECHNICIAN, { network });
  await cacheWhileOnline(technician, incident.id);

  network.online = false;
  const note = technician.work.addNote(incident.id, 'Se requiere repuesto ficticio');
  const noteId = note.ok ? note.operationId : '';
  await coordinatorActs(incident, 'prioritize', { priority: 'high' });

  network.online = true;
  const report = await technician.sync.sync();
  expect(report).toMatchObject({ rebased: [noteId], confirmed: [noteId], conflicts: [] });
  const copy = await serverCopy(incident.id);
  expect(copy).toMatchObject({ version: 4, status: 'assigned', payload: { priority: 'high', assignedTechnicianId: 'technician-1' } });
  expect(copy.payload.notes).toEqual([{ actorId: 'technician-1', text: 'Se requiere repuesto ficticio' }]);
});

test('a lost answer: the same operation is sent again and the server applies it only once', async () => {
  const incident = await assignedIncident();
  const technician = await openDevice(TECHNICIAN);
  await cacheWhileOnline(technician, incident.id);
  const start = technician.work.startWork(incident.id);
  const startId = start.ok ? start.operationId : '';

  // The server stores the change but answers after the client's own deadline.
  const store = openOfflineStore(technician.db).store;
  const lossyGateway = createHttpIncidentGateway({
    baseUrl,
    session: technician.app.session,
    fetchImpl: transport({ online: true }, []),
    timeoutMs: 400,
    scenario: 'timeout_after_commit',
  });
  const lost = await createSyncEngine({ store, gateway: lossyGateway, actor: TECHNICIAN }).sync();
  expect(lost).toMatchObject({ confirmed: [], stoppedBy: 'timeout', pending: [startId] });
  expect(technician.work.pending()).toEqual([expect.objectContaining({ operationId: startId, attempts: 1, state: 'pending' })]);
  expect(historyOf(await serverCopy(incident.id), startId)).toHaveLength(1);

  const replay = await technician.sync.sync();
  expect(replay).toMatchObject({ confirmed: [startId], replayed: [startId] });
  expect(technician.work.pending()).toEqual([]);
  const copy = await serverCopy(incident.id);
  expect(copy).toMatchObject({ version: 3, status: 'in_progress' });
  expect(historyOf(copy, startId)).toHaveLength(1);
});

test('an unconfirmed operation stays pending: server error and no connection', async () => {
  const incident = await assignedIncident();
  const network: Network = { online: true };
  const technician = await openDevice(TECHNICIAN, { network });
  await cacheWhileOnline(technician, incident.id);
  const note = technician.work.addNote(incident.id, 'Nota ficticia sin confirmar');
  const noteId = note.ok ? note.operationId : '';
  const store = openOfflineStore(technician.db).store;

  const failing = createHttpIncidentGateway({
    baseUrl,
    session: technician.app.session,
    fetchImpl: transport({ online: true }, []),
    scenario: 'server_error',
  });
  await expect(createSyncEngine({ store, gateway: failing, actor: TECHNICIAN }).sync()).resolves.toMatchObject({
    confirmed: [],
    stoppedBy: 'server_error',
    pending: [noteId],
  });
  network.online = false;
  await expect(technician.sync.sync()).resolves.toMatchObject({ confirmed: [], stoppedBy: 'network', pending: [noteId] });
  expect(technician.work.pending()).toEqual([expect.objectContaining({ operationId: noteId, attempts: 2, state: 'pending' })]);
  expect((await serverCopy(incident.id)).payload.notes).toEqual([]);

  network.online = true;
  await expect(technician.sync.sync()).resolves.toMatchObject({ confirmed: [noteId] });
  expect((await serverCopy(incident.id)).payload.notes).toEqual([{ actorId: 'technician-1', text: 'Nota ficticia sin confirmar' }]);
});
