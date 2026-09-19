import type { IncidentCategory, IncidentStatus } from '../contracts';

export type Incident = Readonly<{
  id: string;
  title: string;
  category: IncidentCategory;
  description: string;
  location: string;
  status: IncidentStatus;
  /** Campus member who reported the incident; scopes reporter visibility. */
  reporterId: string;
  /** Technician currently responsible, or null while unassigned. */
  assignedTechnicianId: string | null;
}>;

export interface IncidentRepository {
  list(): Promise<readonly Incident[]>;
  getById(id: string): Promise<Incident | null>;
  /** Persists a new responsible technician; returns null when the id is unknown. */
  saveAssignment(id: string, technicianId: string | null): Promise<Incident | null>;
}
