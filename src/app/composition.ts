import { createIncidentAssignments, type IncidentAssignments } from '../campusops/application/incidentAssignments';
import { createIncidentQueries, type IncidentQueries } from '../campusops/application/incidentQueries';
import type { CampusActor } from '../campusops/domain/accessPolicy';
import { InMemoryIncidentRepository } from '../campusops/infrastructure/inMemoryIncidentRepository';

/**
 * Synthetic signed-in actor. Real session handling is deferred to ADR-003; the
 * composition root supplies a fixed fictional identity so the screens already
 * read through the access policy instead of the whole campus backlog.
 */
export const CURRENT_ACTOR: CampusActor = { id: 'campus-reporter-201', role: 'reporter' };

export type CampusOpsApp = Readonly<{
  queries: IncidentQueries;
  assignments: IncidentAssignments;
}>;

export function createCampusOpsApp(): CampusOpsApp {
  const repository = new InMemoryIncidentRepository();
  return {
    queries: createIncidentQueries(repository),
    assignments: createIncidentAssignments(repository),
  };
}
