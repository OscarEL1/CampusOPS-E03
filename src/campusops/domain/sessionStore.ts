import type { CampusRole } from '../contracts';

/**
 * Session obtained from the course backend login (ADR-003). The tokens are
 * fixtures of the local simulator; `expiresAt` is epoch milliseconds from the
 * injected clock and `generation` numbers each token the session has held.
 */
export type StoredSession = Readonly<{
  actorId: string;
  role: CampusRole;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  generation: number;
}>;

/** Domain port: callers do not depend on Expo or a particular device store. */
export interface SessionStore {
  save(session: StoredSession): Promise<void>;
  read(): Promise<StoredSession | null>;
  clear(): Promise<void>;
}
