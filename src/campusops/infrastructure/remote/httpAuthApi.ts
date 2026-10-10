import type { CampusRole } from '../../contracts';
import type { AuthApi, AuthResult, IssuedTokens } from '../../domain/session';
import type { FetchLike } from './httpIncidentGateway';
import { isPlainObject } from './remoteResource';

/**
 * Authentication endpoints of the course backend: POST /v1/session/login and
 * POST /v1/session/refresh. The actor selector is a teaching fixture of the
 * simulator, not production authentication. Nothing here logs or stores a
 * token; the session manager persists them through SessionStore.
 *
 * Classification: 200 with the published shape is ok; 400, 401 and 403 are a
 * definitive refusal (`rejected`); anything else (timeout, network, 5xx, 429 or
 * an unexpected body) is `unavailable`.
 */

export type HttpAuthApiOptions = Readonly<{
  baseUrl: string;
  fetchImpl: FetchLike;
  timeoutMs?: number;
  /** Selects a published backend variant. For controlled tests and demos only. */
  scenario?: string;
}>;

export const DEFAULT_AUTH_TIMEOUT_MS = 8000;

const ROLES: readonly CampusRole[] = ['reporter', 'technician', 'coordinator'];

type Answer = Readonly<{ status: number; json: unknown }> | null;

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function readTokens(json: unknown): IssuedTokens | null {
  if (!isPlainObject(json)) {
    return null;
  }
  const { accessToken, refreshToken, expiresIn } = json;
  if (!nonEmpty(accessToken) || !nonEmpty(refreshToken)) {
    return null;
  }
  if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    return null;
  }
  return { accessToken, refreshToken, expiresInSeconds: expiresIn };
}

export function createHttpAuthApi(options: HttpAuthApiOptions): AuthApi {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const timeoutMs = options.timeoutMs ?? DEFAULT_AUTH_TIMEOUT_MS;

  async function post(path: string, body: Readonly<Record<string, string>>): Promise<Answer> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(null);
      }, timeoutMs);
    });
    const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' };
    if (options.scenario !== undefined) {
      headers['X-Course-Scenario'] = options.scenario;
    }
    const attempt = (async (): Promise<Answer> => {
      try {
        const response = await options.fetchImpl(`${baseUrl}${path}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (typeof response.status !== 'number') {
          return null;
        }
        const text = await response.text();
        try {
          return { status: response.status, json: JSON.parse(text) as unknown };
        } catch {
          return { status: response.status, json: null };
        }
      } catch {
        return null;
      }
    })();
    try {
      return await Promise.race([attempt, deadline]);
    } finally {
      clearTimeout(timer);
    }
  }

  function refused(answer: Answer): boolean {
    return answer !== null && (answer.status === 400 || answer.status === 401 || answer.status === 403);
  }

  return {
    async login(actorId) {
      const answer = await post('/v1/session/login', { actorId });
      if (refused(answer)) {
        return { ok: false, failure: { kind: 'rejected' } };
      }
      if (answer === null || answer.status !== 200 || !isPlainObject(answer.json)) {
        return { ok: false, failure: { kind: 'unavailable' } };
      }
      const tokens = readTokens(answer.json);
      const { role } = answer.json;
      if (tokens === null || answer.json.actorId !== actorId || !ROLES.includes(role as CampusRole)) {
        return { ok: false, failure: { kind: 'unavailable' } };
      }
      return { ok: true, value: { ...tokens, actorId, role: role as CampusRole } };
    },

    async refresh(refreshToken): Promise<AuthResult<IssuedTokens>> {
      const answer = await post('/v1/session/refresh', { refreshToken });
      if (refused(answer)) {
        return { ok: false, failure: { kind: 'rejected' } };
      }
      const tokens = answer !== null && answer.status === 200 ? readTokens(answer.json) : null;
      return tokens === null ? { ok: false, failure: { kind: 'unavailable' } } : { ok: true, value: tokens };
    },
  };
}
