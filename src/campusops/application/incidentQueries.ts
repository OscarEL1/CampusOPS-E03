import type { Incident, IncidentRepository } from '../domain/incident';

export type IncidentQueries = Readonly<{
  listIncidents(): Promise<readonly Incident[]>;
  getIncident(id: string): Promise<Incident | null>;
}>;

export function createIncidentQueries(repository: IncidentRepository): IncidentQueries {
  return {
    listIncidents: () => repository.list(),
    getIncident: (id) => repository.getById(id),
  };
}
