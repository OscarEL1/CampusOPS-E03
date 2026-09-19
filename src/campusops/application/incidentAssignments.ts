import { canAssignIncident, type CampusActor } from '../domain/accessPolicy';
import type { Incident, IncidentRepository } from '../domain/incident';

export type AssignmentResult =
  | Readonly<{ outcome: 'assigned'; incident: Incident }>
  | Readonly<{ outcome: 'denied' }>
  | Readonly<{ outcome: 'not_found' }>;

export type IncidentAssignments = Readonly<{
  reassign(actor: CampusActor, incidentId: string, technicianId: string | null): Promise<AssignmentResult>;
}>;

export function createIncidentAssignments(repository: IncidentRepository): IncidentAssignments {
  return {
    async reassign(actor, incidentId, technicianId) {
      if (!canAssignIncident(actor)) {
        // The authorization check runs before the repository, so a denied
        // attempt leaves no write behind.
        return { outcome: 'denied' };
      }
      const incident = await repository.saveAssignment(incidentId, technicianId);
      if (incident === null) {
        return { outcome: 'not_found' };
      }
      return { outcome: 'assigned', incident };
    },
  };
}
