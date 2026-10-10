import { createIncidentAssignments, type IncidentAssignments } from '../campusops/application/incidentAssignments';
import { createIncidentQueries, type IncidentQueries } from '../campusops/application/incidentQueries';
import { createSessionManager, type SessionManager } from '../campusops/application/sessionManager';
import {
  createRemoteIncidentQueries,
  type RemoteIncidentQueries,
} from '../campusops/application/remoteIncidentQueries';
import type { CampusActor } from '../campusops/domain/accessPolicy';
import type { AuthApi, Clock } from '../campusops/domain/session';
import type { SessionStore } from '../campusops/domain/sessionStore';
import { InMemoryIncidentRepository } from '../campusops/infrastructure/inMemoryIncidentRepository';
import { createHttpAuthApi } from '../campusops/infrastructure/remote/httpAuthApi';
import { createHttpIncidentGateway, type FetchLike } from '../campusops/infrastructure/remote/httpIncidentGateway';
import { SecureSessionStore } from '../campusops/infrastructure/secureSessionStore';

const DEFAULT_COURSE_BACKEND_URL = 'http://127.0.0.1:4310';

/** Read here, not imported, so a test that mocks the health client stays isolated. */
function courseBackendUrl(): string {
  return process.env.EXPO_PUBLIC_COURSE_BACKEND_URL ?? DEFAULT_COURSE_BACKEND_URL;
}

const platformFetch: FetchLike = (url, init) => fetch(url, init);

const systemClock: Clock = { now: () => Date.now() };

export type CampusOpsApp = Readonly<{
  /** In-memory reads kept for the week 02 and week 03 controls and their tests. */
  queries: IncidentQueries;
  assignments: IncidentAssignments;
  sessionStore: SessionStore;
  /** Login, shared refresh and logout (week 06). The only source of tokens. */
  session: SessionManager;
  /**
   * Incident use cases for the signed-in actor. The gateway asks the session
   * for credentials on every request; the actor only scopes the client-side
   * access policy, the backend still decides.
   */
  remoteIncidentsFor(actor: CampusActor): RemoteIncidentQueries;
}>;

export type CampusOpsAppOptions = Readonly<{
  authApi?: AuthApi;
  fetchImpl?: FetchLike;
  clock?: Clock;
  baseUrl?: string;
}>;

export function createCampusOpsApp(
  sessionStore: SessionStore = new SecureSessionStore(),
  options: CampusOpsAppOptions = {},
): CampusOpsApp {
  const repository = new InMemoryIncidentRepository();
  const baseUrl = options.baseUrl ?? courseBackendUrl();
  const fetchImpl = options.fetchImpl ?? platformFetch;
  const session = createSessionManager({
    store: sessionStore,
    authApi: options.authApi ?? createHttpAuthApi({ baseUrl, fetchImpl }),
    clock: options.clock ?? systemClock,
  });
  const gateway = createHttpIncidentGateway({ baseUrl, session, fetchImpl });
  return {
    queries: createIncidentQueries(repository),
    assignments: createIncidentAssignments(repository),
    sessionStore,
    session,
    remoteIncidentsFor: (actor) => createRemoteIncidentQueries(gateway, actor),
  };
}
