import type { CampusRole } from '../contracts';

/** Minimal session shape that ADR-003 will eventually obtain from authentication. */
export type StoredSession = Readonly<{
  actorId: string;
  role: CampusRole;
  accessToken: string;
}>;

/** Domain port: callers do not depend on Expo or a particular device store. */
export interface SessionStore {
  save(session: StoredSession): Promise<void>;
  read(): Promise<StoredSession | null>;
  clear(): Promise<void>;
}
