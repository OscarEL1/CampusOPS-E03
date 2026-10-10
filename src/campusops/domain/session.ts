import type { CampusRole } from '../contracts';

/** What one request needs from the session: the token, its generation and the actor. */
export type SessionCredentials = Readonly<{
  accessToken: string;
  actorId: string;
  generation: number;
}>;

/**
 * Domain port the HTTP client asks for credentials. `authorize` runs before a
 * request; `renew` runs after a 401 with the credentials that request used.
 * Both resolve null when there is no session to use, and never reject.
 */
export interface AccessTokenSource {
  authorize(requestId: string): Promise<SessionCredentials | null>;
  renew(requestId: string, used: SessionCredentials): Promise<SessionCredentials | null>;
}

/** Injected time source, so expiry is tested without real waits. */
export type Clock = Readonly<{ now(): number }>;

export type IssuedTokens = Readonly<{
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}>;

/**
 * `rejected`: the server refused the credentials (login or refresh grant), a
 * definitive answer. `unavailable`: no usable answer (network, timeout, 5xx or
 * a malformed body), which says nothing about whether the session is valid.
 */
export type AuthFailure = Readonly<{ kind: 'rejected' }> | Readonly<{ kind: 'unavailable' }>;

export type AuthResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; failure: AuthFailure }>;

/** Domain port for the authentication endpoints of the backend. Never rejects. */
export interface AuthApi {
  login(actorId: string): Promise<AuthResult<IssuedTokens & Readonly<{ actorId: string; role: CampusRole }>>>;
  refresh(refreshToken: string): Promise<AuthResult<IssuedTokens>>;
}
