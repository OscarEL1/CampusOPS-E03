import type { CampusRole } from '../contracts';
import type { Incident } from './incident';

/** Identity that the application layer receives from the session boundary. */
export type CampusActor = Readonly<{
  id: string;
  role: CampusRole;
}>;

/**
 * Decides whether an actor may read an incident.
 *
 * Coordination reads the whole campus backlog; a technician reads only what is
 * assigned to them and a reporter reads only what they reported. Any unknown
 * role is denied, so a future role cannot silently inherit read access.
 */
export function canViewIncident(actor: CampusActor, incident: Incident): boolean {
  switch (actor.role) {
    case 'coordinator':
      return true;
    case 'technician':
      return incident.assignedTechnicianId === actor.id;
    case 'reporter':
      return incident.reporterId === actor.id;
    default:
      return false;
  }
}

/**
 * Decides whether an actor may change who works an incident.
 *
 * Only coordination reassigns work. A technician cannot take or drop an
 * assignment by calling the use case directly.
 */
export function canAssignIncident(actor: CampusActor): boolean {
  return actor.role === 'coordinator';
}
