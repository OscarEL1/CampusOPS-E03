import { createSessionManager, type SessionSnapshot } from '../src/campusops/application/sessionManager';
import { createRemoteIncidentQueries } from '../src/campusops/application/remoteIncidentQueries';
import type { AuthApi, AuthResult, IssuedTokens, SessionCredentials } from '../src/campusops/domain/session';
import type { SessionStore, StoredSession } from '../src/campusops/domain/sessionStore';
import {
  createHttpIncidentGateway,
  type FetchLike,
  type HttpRequest,
} from '../src/campusops/infrastructure/remote/httpIncidentGateway';

/**
 * Week 06: the session manager with a controllable clock, an in-memory store
 * and an authentication API whose answers the test releases by hand. Nothing
 * waits on real time. All tokens are fictional fixtures.
 */

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function memoryStore(initial: StoredSession | null = null) {
  let current = initial;
  const saved: StoredSession[] = [];
  let clears = 0;
  const store: SessionStore = {
    async save(session) {
      saved.push(session);
      current = session;
    },
    async read() {
      return current;
    },
    async clear() {
      clears += 1;
      current = null;
    },
  };
  return { store, saved, current: () => current, clears: () => clears };
}

function manualClock(start = 1_000_000) {
  let time = start;
  return { now: () => time, advance: (ms: number) => (time += ms) };
}

const LOGIN_TOKENS = { accessToken: 'fixture-access-gen-1', refreshToken: 'fixture-refresh-gen-1', expiresInSeconds: 60 };
const RENEWED: AuthResult<IssuedTokens> = {
  ok: true,
  value: { accessToken: 'fixture-access-gen-2', refreshToken: 'fixture-refresh-gen-2', expiresInSeconds: 60 },
};

function fakeAuth() {
  const refreshCalls: string[] = [];
  let pending = deferred<AuthResult<IssuedTokens>>();
  const api: AuthApi = {
    async login(actorId) {
      if (!actorId.startsWith('reporter') && !actorId.startsWith('technician') && !actorId.startsWith('coordinator')) {
        return { ok: false, failure: { kind: 'rejected' } };
      }
      const role = actorId.startsWith('reporter') ? 'reporter' : actorId.startsWith('technician') ? 'technician' : 'coordinator';
      return { ok: true, value: { ...LOGIN_TOKENS, actorId, role } };
    },
    refresh(refreshToken) {
      refreshCalls.push(refreshToken);
      return pending.promise;
    },
  };
  return {
    api,
    refreshCalls,
    answer(result: AuthResult<IssuedTokens>) {
      pending.resolve(result);
      pending = deferred();
    },
  };
}

/** Lets every queued microtask run, so awaited store writes complete. */
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

async function signedIn(options: { log?: (entry: unknown) => void } = {}) {
  const storage = memoryStore();
  const auth = fakeAuth();
  const clock = manualClock();
  const session = createSessionManager({
    store: storage.store,
    authApi: auth.api,
    clock,
    ...(options.log === undefined ? {} : { log: options.log }),
  });
  await session.restore();
  const login = await session.login('reporter-1');
  expect(login.ok).toBe(true);
  return { storage, auth, clock, session };
}

describe('login, restore and logout', () => {
  test('login persists the session and exposes the actor without its tokens', async () => {
    const { storage, session } = await signedIn();
    expect(session.snapshot()).toEqual({ status: 'authenticated', actor: { id: 'reporter-1', role: 'reporter' } });
    expect(storage.current()).toMatchObject({ actorId: 'reporter-1', accessToken: 'fixture-access-gen-1', generation: 1 });
    expect(JSON.stringify(session.snapshot())).not.toContain('fixture-access');
  });

  test('a refused login stays anonymous and writes nothing', async () => {
    const storage = memoryStore();
    const session = createSessionManager({ store: storage.store, authApi: fakeAuth().api, clock: manualClock() });
    await session.restore();
    const result = await session.login('not-a-fixture-actor');
    expect(result).toEqual({ ok: false, failure: { kind: 'rejected' } });
    expect(session.snapshot().status).toBe('anonymous');
    expect(storage.saved).toEqual([]);
  });

  test('restore reads a persisted session and an empty or broken store means anonymous', async () => {
    const persisted: StoredSession = {
      actorId: 'technician-1',
      role: 'technician',
      accessToken: 'fixture-access-gen-3',
      refreshToken: 'fixture-refresh-gen-3',
      expiresAt: 2_000_000,
      generation: 3,
    };
    const restored = createSessionManager({ store: memoryStore(persisted).store, authApi: fakeAuth().api, clock: manualClock() });
    await expect(restored.restore()).resolves.toEqual({ status: 'authenticated', actor: { id: 'technician-1', role: 'technician' } });

    const empty = createSessionManager({ store: memoryStore().store, authApi: fakeAuth().api, clock: manualClock() });
    await expect(empty.restore()).resolves.toEqual({ status: 'anonymous', actor: null });

    const broken: SessionStore = {
      save: async () => undefined,
      read: async () => {
        throw new Error('keychain unavailable');
      },
      clear: async () => undefined,
    };
    const fromBroken = createSessionManager({ store: broken, authApi: fakeAuth().api, clock: manualClock() });
    await expect(fromBroken.restore()).resolves.toEqual({ status: 'anonymous', actor: null });
  });

  test('logout deletes the persisted session and later requests get no credentials', async () => {
    const { storage, session } = await signedIn();
    await session.logout();
    expect(storage.current()).toBeNull();
    expect(storage.clears()).toBe(1);
    expect(session.snapshot()).toEqual({ status: 'anonymous', actor: null });
    await expect(session.authorize('after-logout')).resolves.toBeNull();
  });
});

describe('shared refresh', () => {
  test('three coinciding 401s call the refresh endpoint once and all get the renewed token', async () => {
    const { storage, auth, session } = await signedIn();
    const used = (await session.authorize('a')) as SessionCredentials;

    const waiting = Promise.all([session.renew('a', used), session.renew('b', used), session.renew('c', used)]);
    expect(session.snapshot().status).toBe('refreshing');
    expect(auth.refreshCalls).toEqual(['fixture-refresh-gen-1']);

    auth.answer(RENEWED);
    const [a, b, c] = await waiting;
    expect(auth.refreshCalls).toHaveLength(1);
    for (const renewed of [a, b, c]) {
      expect(renewed).toEqual({ accessToken: 'fixture-access-gen-2', actorId: 'reporter-1', generation: 2 });
    }
    expect(storage.current()).toMatchObject({ accessToken: 'fixture-access-gen-2', refreshToken: 'fixture-refresh-gen-2', generation: 2 });
    expect(session.snapshot().status).toBe('authenticated');
  });

  test('a late 401 from the old token after the refresh is retried without refreshing again', async () => {
    const { auth, session } = await signedIn();
    const old = (await session.authorize('a')) as SessionCredentials;
    const first = session.renew('a', old);
    auth.answer(RENEWED);
    await first;
    await expect(session.renew('late', old)).resolves.toMatchObject({ generation: 2 });
    expect(auth.refreshCalls).toHaveLength(1);
  });

  test('a request that still gets 401 after its retry fails instead of refreshing again', async () => {
    const { auth, session } = await signedIn();
    const old = (await session.authorize('a')) as SessionCredentials;
    const first = session.renew('a', old);
    auth.answer(RENEWED);
    const renewed = (await first) as SessionCredentials;
    await expect(session.renew('a', renewed)).resolves.toBeNull();
    expect(auth.refreshCalls).toHaveLength(1);
  });
});

describe('expiry with a controllable clock', () => {
  test('a token is sent as is before expiry and renewed once, before sending, after it', async () => {
    const { auth, clock, session } = await signedIn();
    await expect(session.authorize('early')).resolves.toMatchObject({ generation: 1 });
    clock.advance(54_000);
    await expect(session.authorize('still-valid')).resolves.toMatchObject({ generation: 1 });
    expect(auth.refreshCalls).toHaveLength(0);

    clock.advance(1_000);
    const pending = Promise.all([session.authorize('x'), session.authorize('y'), session.authorize('z')]);
    expect(auth.refreshCalls).toHaveLength(1);
    auth.answer(RENEWED);
    const renewed = await pending;
    expect(renewed.map((item) => item?.generation)).toEqual([2, 2, 2]);
  });
});

describe('failed, unavailable and obsolete refresh', () => {
  test('a refused refresh returns to anonymous, deletes the session and fails every waiting request', async () => {
    const { storage, auth, session } = await signedIn();
    const statuses: SessionSnapshot['status'][] = [];
    session.subscribe((snapshot) => statuses.push(snapshot.status));
    const used = (await session.authorize('a')) as SessionCredentials;

    const waiting = Promise.all([session.renew('a', used), session.renew('b', used), session.renew('c', used)]);
    auth.answer({ ok: false, failure: { kind: 'rejected' } });

    await expect(waiting).resolves.toEqual([null, null, null]);
    expect(statuses).toEqual(['refreshing', 'anonymous']);
    expect(storage.current()).toBeNull();
    expect(auth.refreshCalls).toHaveLength(1);
    await expect(session.renew('d', used)).resolves.toBeNull();
    expect(auth.refreshCalls).toHaveLength(1);
  });

  test('an unavailable refresh keeps the session and fails only the waiting requests', async () => {
    const { storage, auth, session } = await signedIn();
    const used = (await session.authorize('a')) as SessionCredentials;
    const waiting = Promise.all([session.renew('a', used), session.renew('b', used)]);
    auth.answer({ ok: false, failure: { kind: 'unavailable' } });

    await expect(waiting).resolves.toEqual([null, null]);
    expect(session.snapshot().status).toBe('authenticated');
    expect(storage.current()).toMatchObject({ generation: 1 });
    expect(storage.clears()).toBe(0);
  });

  test('a refresh that answers after logout is obsolete and does not restore the session', async () => {
    const { storage, auth, session } = await signedIn();
    const used = (await session.authorize('a')) as SessionCredentials;
    const waiting = session.renew('a', used);

    await session.logout();
    await expect(waiting).resolves.toBeNull();
    auth.answer(RENEWED);
    await flush();

    expect(storage.current()).toBeNull();
    expect(storage.saved.map((item) => item.generation)).toEqual([1]);
    expect(session.snapshot()).toEqual({ status: 'anonymous', actor: null });
  });

  test('session logs never contain a token', async () => {
    const entries: unknown[] = [];
    const { auth, session } = await signedIn({ log: (entry) => entries.push(entry) });
    const used = (await session.authorize('a')) as SessionCredentials;
    const first = session.renew('a', used);
    auth.answer(RENEWED);
    await first;
    await session.logout();

    const text = JSON.stringify(entries);
    expect(entries.length).toBeGreaterThan(3);
    for (const secret of ['fixture-access-gen-1', 'fixture-access-gen-2', 'fixture-refresh-gen-1', 'fixture-refresh-gen-2', 'Bearer']) {
      expect(text).not.toContain(secret);
    }
  });
});

describe('HTTP client with the session', () => {
  const ENVELOPE = {
    id: 'campus-inc-001',
    version: 1,
    status: 'assigned',
    payload: {
      category: 'connectivity',
      description: 'Sin conexión en laboratorio ficticio',
      location: 'Edificio de prueba A',
      reporterId: 'reporter-1',
      assignedTechnicianId: 'technician-1',
    },
  };

  function respond(status: number, body: unknown) {
    return { status, headers: { get: () => null }, text: async () => JSON.stringify(body) };
  }

  function scriptedServer(acceptedToken: string) {
    const calls: HttpRequest[] = [];
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push(init);
      if (init.headers.Authorization !== `Bearer ${acceptedToken}`) {
        return respond(401, { code: 'unauthorized' });
      }
      if (init.method === 'POST') {
        return respond(201, { incident: ENVELOPE, operationId: init.headers['Idempotency-Key'], duplicate: false });
      }
      return respond(200, url.endsWith('/v1/incidents') ? { items: [ENVELOPE] } : ENVELOPE);
    };
    return { calls, fetchImpl };
  }

  test('list, detail and create hit 401 together: one refresh, one retry each, same idempotency key', async () => {
    const { auth, session } = await signedIn();
    const server = scriptedServer('fixture-access-gen-2');
    const gateway = createHttpIncidentGateway({ baseUrl: 'http://127.0.0.1:1', session, fetchImpl: server.fetchImpl });
    const queries = createRemoteIncidentQueries(gateway, { id: 'reporter-1', role: 'reporter' });

    const running = Promise.all([
      queries.list(),
      queries.get('campus-inc-001'),
      queries.create({ category: 'water', description: 'Fuga ficticia', location: 'Aula de prueba' }, 'fixture-key-0001'),
    ]);
    await flush();
    expect(auth.refreshCalls).toHaveLength(1);
    auth.answer(RENEWED);
    const [list, detail, created] = await running;

    expect([list.ok, detail.ok, created.ok]).toEqual([true, true, true]);
    expect(auth.refreshCalls).toHaveLength(1);
    expect(server.calls).toHaveLength(6);
    const posts = server.calls.filter((call) => call.method === 'POST');
    expect(posts.map((call) => call.headers['Idempotency-Key'])).toEqual(['fixture-key-0001', 'fixture-key-0001']);
    expect(server.calls.slice(3).every((call) => call.headers.Authorization === 'Bearer fixture-access-gen-2')).toBe(true);
  });

  test('a server that keeps answering 401 ends in unauthorized after one refresh and one retry', async () => {
    const { auth, session } = await signedIn();
    const server = scriptedServer('a-token-nobody-has');
    const gateway = createHttpIncidentGateway({ baseUrl: 'http://127.0.0.1:1', session, fetchImpl: server.fetchImpl });

    const running = gateway.list();
    await flush();
    auth.answer(RENEWED);
    await expect(running).resolves.toEqual({ ok: false, failure: { kind: 'unauthorized' } });
    expect(server.calls).toHaveLength(2);
    expect(auth.refreshCalls).toHaveLength(1);
  });

  test('with no session the request is not sent at all', async () => {
    const storage = memoryStore();
    const session = createSessionManager({ store: storage.store, authApi: fakeAuth().api, clock: manualClock() });
    await session.restore();
    const server = scriptedServer('fixture-access-gen-1');
    const gateway = createHttpIncidentGateway({ baseUrl: 'http://127.0.0.1:1', session, fetchImpl: server.fetchImpl });
    await expect(gateway.list()).resolves.toEqual({ ok: false, failure: { kind: 'unauthorized' } });
    expect(server.calls).toHaveLength(0);
  });
});
