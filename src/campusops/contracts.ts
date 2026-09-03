/** Public domain vocabulary; teams choose their internal architecture. */
export type CampusRole = 'reporter' | 'technician' | 'coordinator';
export type IncidentStatus = 'open' | 'assigned' | 'in_progress' | 'resolved' | 'closed';
export type IncidentCategory =
  | 'electrical' | 'laboratory' | 'water' | 'connectivity'
  | 'equipment' | 'safety' | 'maintenance';

export type IncidentWork = Readonly<{
  assignedTechnicianId: string | null;
  status: IncidentStatus;
}>;

export type IncidentLocation = Readonly<{
  source: 'provider' | 'manual';
  label: string;
  latitude?: number;
  longitude?: number;
}>;

export type PendingIncidentOperation = Readonly<{
  operationId: string;
  incidentId: string;
  baseVersion: number;
  actorId: string;
  action: string;
  payload: Readonly<Record<string, unknown>>;
}>;
