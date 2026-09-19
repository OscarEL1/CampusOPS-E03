import { canViewIncident, type CampusActor } from '../domain/accessPolicy';
import type { Incident, IncidentRepository } from '../domain/incident';

export type IncidentQueries = Readonly<{
  listIncidents(actor: CampusActor): Promise<readonly Incident[]>;
  getIncident(actor: CampusActor, id: string): Promise<Incident | null>;
}>;

export function createIncidentQueries(repository: IncidentRepository): IncidentQueries {
  return {
    async listIncidents(actor) {
      const incidents = await repository.list();
      return incidents.filter((incident) => canViewIncident(actor, incident));
    },
    async getIncident(actor, id) {
      const incident = await repository.getById(id);
      if (incident === null || !canViewIncident(actor, incident)) {
        // A denied read answers exactly like a missing id, so the response does
        // not confirm that another member's incident exists.
        return null;
      }
      return incident;
    },
  };
}
