import type { CampusActor } from '../domain/accessPolicy';
import { redactSensitive } from '../domain/logRedaction';
import type { AccessTokenSource, AuthApi, AuthFailure, Clock, SessionCredentials } from '../domain/session';
import { initialRefreshState, reduceSessionEvent, type RefreshState, type SessionEvent } from '../domain/sessionRefresh';
import type { SessionStore, StoredSession } from '../domain/sessionStore';

/**
 * Session lifecycle of CampusOps: restore, login, expiry, shared refresh and
 * logout. The refresh policy is the pure reducer in domain/sessionRefresh; this
 * module only performs the side effects it decides (call the refresh endpoint,
 * persist, clear) and wakes the requests waiting for it.
 *
 * States (docs/session-state-machine.mmd):
 *   restoring -> anonymous | authenticated
 *   anonymous --login ok--> authenticated
 *   authenticated --401 or expiry--> refreshing
 *   refreshing --refresh ok--> authenticated (generation + 1)
 *   refreshing --grant refused--> anonymous (store cleared)
 *   refreshing --no answer--> authenticated (waiting requests fail)
 *   authenticated | refreshing --logout--> anonymous (store cleared)
 */

export type SessionStatus = 'restoring' | 'anonymous' | 'authenticated' | 'refreshing';

export type SessionSnapshot = Readonly<{
  status: SessionStatus;
  actor: CampusActor | null;
}>;

export type LoginResult = Readonly<{ ok: true; actor: CampusActor }> | Readonly<{ ok: false; failure: AuthFailure }>;

export type SessionManager = AccessTokenSource &
  Readonly<{
    restore(): Promise<SessionSnapshot>;
    login(actorId: string): Promise<LoginResult>;
    logout(): Promise<void>;
    snapshot(): SessionSnapshot;
    subscribe(listener: (snapshot: SessionSnapshot) => void): () => void;
  }>;

export type SessionManagerOptions = Readonly<{
  store: SessionStore;
  authApi: AuthApi;
  clock: Clock;
  /** A token this close to its expiry is renewed before it is sent. */
  expirySkewMs?: number;
  log?: (entry: unknown) => void;
}>;

export const DEFAULT_EXPIRY_SKEW_MS = 5000;

export function createSessionManager(options: SessionManagerOptions): SessionManager {
  const skew = options.expirySkewMs ?? DEFAULT_EXPIRY_SKEW_MS;
  const listeners = new Set<(snapshot: SessionSnapshot) => void>();
  const waiters = new Map<string, (credentials: SessionCredentials | null) => void>();
  let status: SessionStatus = 'restoring';
  let session: StoredSession | null = null;
  let policy: RefreshState = initialRefreshState(null);
  let lastGeneration = 0;
  // Bumped by every login and logout. A refresh that started under another
  // epoch belongs to a session that no longer exists and must not write.
  let epoch = 0;

  function log(entry: Record<string, unknown>): void {
    try {
      options.log?.(redactSensitive({ event: 'session', ...entry }));
    } catch {
      // A failing log sink never changes the session.
    }
  }

  function credentialsOf(current: StoredSession): SessionCredentials {
    return { accessToken: current.accessToken, actorId: current.actorId, generation: current.generation };
  }

  function snapshot(): SessionSnapshot {
    return { status, actor: session === null ? null : { id: session.actorId, role: session.role } };
  }

  function setStatus(next: SessionStatus): void {
    if (next === status) {
      return;
    }
    log({ transition: `${status}->${next}` });
    status = next;
    const current = snapshot();
    for (const listener of listeners) {
      try {
        listener(current);
      } catch {
        // One broken listener must not block the others.
      }
    }
  }

  function dispatch(event: SessionEvent): RefreshState {
    const before = policy;
    policy = reduceSessionEvent(policy, event);
    return before;
  }

  /** Wakes every request whose outcome the last event decided. */
  function settle(before: RefreshState): void {
    const credentials = session === null ? null : credentialsOf(session);
    for (const id of policy.retried.slice(before.retried.length)) {
      waiters.get(id)?.(credentials);
      waiters.delete(id);
    }
    for (const id of policy.failed.slice(before.failed.length)) {
      waiters.get(id)?.(null);
      waiters.delete(id);
    }
  }

  async function endSession(): Promise<void> {
    session = null;
    try {
      await options.store.clear();
    } catch {
      // The in-memory session is already gone; the next restore validates
      // whatever the store still holds.
      log({ storeClear: 'failed' });
    }
  }

  async function failRefresh(): Promise<void> {
    const before = dispatch({ type: 'refreshFailed' });
    await endSession();
    settle(before);
    setStatus('anonymous');
  }

  async function runRefresh(): Promise<void> {
    const startedEpoch = epoch;
    const current = session;
    if (current === null) {
      return;
    }
    log({ refresh: 'start', generation: current.generation });
    let outcome: Awaited<ReturnType<AuthApi['refresh']>>;
    try {
      outcome = await options.authApi.refresh(current.refreshToken);
    } catch {
      outcome = { ok: false, failure: { kind: 'unavailable' } };
    }
    if (startedEpoch !== epoch) {
      // A logout or a new login happened meanwhile: this answer is obsolete.
      log({ refresh: 'obsolete' });
      return;
    }
    if (outcome.ok) {
      const next: StoredSession = {
        ...current,
        accessToken: outcome.value.accessToken,
        refreshToken: outcome.value.refreshToken,
        expiresAt: options.clock.now() + outcome.value.expiresInSeconds * 1000,
        generation: current.generation + 1,
      };
      try {
        await options.store.save(next);
      } catch {
        // A renewed session that cannot be persisted is not kept half-saved.
        log({ refresh: 'not_persisted' });
        await failRefresh();
        return;
      }
      if (startedEpoch !== epoch) {
        log({ refresh: 'obsolete' });
        return;
      }
      session = next;
      lastGeneration = next.generation;
      const before = dispatch({ type: 'refreshSucceeded', generation: next.generation, token: next.accessToken });
      log({ refresh: 'succeeded', generation: next.generation });
      settle(before);
      setStatus('authenticated');
      return;
    }
    if (outcome.failure.kind === 'rejected') {
      log({ refresh: 'rejected' });
      await failRefresh();
      return;
    }
    log({ refresh: 'unavailable' });
    const before = dispatch({ type: 'refreshUnavailable' });
    settle(before);
    setStatus('authenticated');
  }

  async function renew(requestId: string, used: SessionCredentials): Promise<SessionCredentials | null> {
    if (session === null) {
      return null;
    }
    const before = dispatch({ type: 'request401', requestId, generation: used.generation });
    const pending = new Promise<SessionCredentials | null>((resolve) => waiters.set(requestId, resolve));
    settle(before);
    if (policy.refreshCalls > before.refreshCalls) {
      setStatus('refreshing');
      void runRefresh();
    }
    return pending;
  }

  return {
    async restore() {
      let stored: StoredSession | null = null;
      try {
        stored = await options.store.read();
      } catch {
        stored = null;
      }
      if (status !== 'restoring') {
        return snapshot();
      }
      if (stored === null) {
        setStatus('anonymous');
        return snapshot();
      }
      session = stored;
      lastGeneration = Math.max(lastGeneration, stored.generation);
      dispatch({ type: 'login', generation: stored.generation, token: stored.accessToken });
      setStatus('authenticated');
      return snapshot();
    },

    async login(actorId) {
      let outcome: Awaited<ReturnType<AuthApi['login']>>;
      try {
        outcome = await options.authApi.login(actorId);
      } catch {
        outcome = { ok: false, failure: { kind: 'unavailable' } };
      }
      if (!outcome.ok) {
        log({ login: outcome.failure.kind });
        return outcome;
      }
      const next: StoredSession = {
        actorId: outcome.value.actorId,
        role: outcome.value.role,
        accessToken: outcome.value.accessToken,
        refreshToken: outcome.value.refreshToken,
        expiresAt: options.clock.now() + outcome.value.expiresInSeconds * 1000,
        generation: lastGeneration + 1,
      };
      try {
        await options.store.save(next);
      } catch {
        log({ login: 'not_persisted' });
        return { ok: false, failure: { kind: 'unavailable' } };
      }
      epoch += 1;
      session = next;
      lastGeneration = next.generation;
      const before = dispatch({ type: 'login', generation: next.generation, token: next.accessToken });
      settle(before);
      log({ login: 'succeeded', generation: next.generation });
      setStatus('authenticated');
      return { ok: true, actor: { id: next.actorId, role: next.role } };
    },

    async logout() {
      epoch += 1;
      const before = dispatch({ type: 'logout' });
      settle(before);
      for (const resolve of waiters.values()) {
        resolve(null);
      }
      waiters.clear();
      await endSession();
      log({ logout: 'done' });
      setStatus('anonymous');
    },

    async authorize(requestId) {
      if (session === null) {
        return null;
      }
      if (options.clock.now() >= session.expiresAt - skew) {
        // A known expiry is handled like a 401 of the current generation, so
        // it joins the same shared refresh instead of sending a dead token.
        return renew(requestId, credentialsOf(session));
      }
      return credentialsOf(session);
    },

    renew,

    snapshot,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
