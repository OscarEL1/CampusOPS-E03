import { createIncidentAssignments, type IncidentAssignments } from '../campusops/application/incidentAssignments';
import { createIncidentQueries, type IncidentQueries } from '../campusops/application/incidentQueries';
import {
  createRemoteIncidentQueries,
  type RemoteIncidentQueries,
} from '../campusops/application/remoteIncidentQueries';
import type { CampusActor } from '../campusops/domain/accessPolicy';
import type { IncidentGateway } from '../campusops/domain/incidentGateway';
import type { SessionStore } from '../campusops/domain/sessionStore';
import { InMemoryIncidentRepository } from '../campusops/infrastructure/inMemoryIncidentRepository';
import { createHttpIncidentGateway } from '../campusops/infrastructure/remote/httpIncidentGateway';
import { SecureSessionStore } from '../campusops/infrastructure/secureSessionStore';

/**
 * Synthetic signed-in actor. Real session handling is deferred to ADR-003; the
 * composition root supplies a fixed fictional identity. Since week 05 it is one
 * of the public fixture actors of the course backend, so the server and the
 * client apply the access policy to the same identity.
 */
export const CURRENT_ACTOR: CampusActor = { id: 'reporter-1', role: 'reporter' };

/**
 * Public fixture from docs/CAMPUSOPS_API.md, accepted only by the local course
 * simulator. It is not a credential and grants nothing outside that simulator.
 * Week 06 replaces it with the token of a real session read from SessionStore.
 */
const COURSE_FIXTURE_ACCESS_TOKEN = 'course-valid-token';

const DEFAULT_COURSE_BACKEND_URL = 'http://127.0.0.1:4310';

/** Read here, not imported, so a test that mocks the health client stays isolated. */
function courseBackendUrl(): string {
  return process.env.EXPO_PUBLIC_COURSE_BACKEND_URL ?? DEFAULT_COURSE_BACKEND_URL;
}

export function createDefaultIncidentGateway(): IncidentGateway {
  return createHttpIncidentGateway({
    baseUrl: courseBackendUrl(),
    accessToken: COURSE_FIXTURE_ACCESS_TOKEN,
    actorId: CURRENT_ACTOR.id,
    fetchImpl: (url, init) => fetch(url, init),
  });
}

export type CampusOpsApp = Readonly<{
  /** In-memory reads kept for the week 02 and week 03 controls and their tests. */
  queries: IncidentQueries;
  assignments: IncidentAssignments;
  sessionStore: SessionStore;
  /** Reads and creates incidents on the course backend through the client layer. */
  remoteIncidents: RemoteIncidentQueries;
}>;

export function createCampusOpsApp(
  sessionStore: SessionStore = new SecureSessionStore(),
  incidentGateway: IncidentGateway = createDefaultIncidentGateway(),
): CampusOpsApp {
  const repository = new InMemoryIncidentRepository();
  return {
    queries: createIncidentQueries(repository),
    assignments: createIncidentAssignments(repository),
    sessionStore,
    remoteIncidents: createRemoteIncidentQueries(incidentGateway, CURRENT_ACTOR),
  };
}
