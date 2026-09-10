import type { IncidentCategory, IncidentStatus } from '../contracts';

export type Incident = Readonly<{
  id: string;
  title: string;
  category: IncidentCategory;
  description: string;
  location: string;
  status: IncidentStatus;
}>;

export interface IncidentRepository {
  list(): Promise<readonly Incident[]>;
  getById(id: string): Promise<Incident | null>;
}
