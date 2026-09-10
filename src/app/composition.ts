import { createIncidentQueries, type IncidentQueries } from '../campusops/application/incidentQueries';
import { InMemoryIncidentRepository } from '../campusops/infrastructure/inMemoryIncidentRepository';

export function createCampusOpsQueries(): IncidentQueries {
  return createIncidentQueries(new InMemoryIncidentRepository());
}
