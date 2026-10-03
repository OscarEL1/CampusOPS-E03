import type { IncidentCategory, IncidentStatus } from '../../contracts';
import type { Incident } from '../../domain/incident';
import type { RemoteIncident } from '../../domain/incidentGateway';
import type { RemoteResource } from './remoteResource';

/**
 * Translation from the incident DTO the server sends to the Incident the app
 * uses. The two are deliberately different shapes:
 *
 * - The DTO payload carries `priority`, `notes`, `evidence`, `history` and,
 *   once resolved, `diagnosis`. None of them is copied. Notes and history hold
 *   internal comments and the identifiers of who acted; they stay out of app
 *   objects until a screen needs them and a rule says how to show them.
 * - The DTO has no title. The app shows a fixed label for the category instead
 *   of inventing a sentence; the label is a translation of a server field, not
 *   new content.
 * - The server `version` travels next to the incident in `RemoteIncident`, not
 *   inside it, because it belongs to the remote copy, not to the incident.
 */

const STATUSES: ReadonlySet<string> = new Set<IncidentStatus>([
  'open',
  'assigned',
  'in_progress',
  'resolved',
  'closed',
]);

const CATEGORY_TITLES: ReadonlyMap<string, string> = new Map<IncidentCategory, string>([
  ['electrical', 'Incidencia eléctrica'],
  ['laboratory', 'Incidencia de laboratorio'],
  ['water', 'Incidencia de agua'],
  ['connectivity', 'Incidencia de conectividad'],
  ['equipment', 'Incidencia de equipo'],
  ['safety', 'Incidencia de seguridad'],
  ['maintenance', 'Incidencia de mantenimiento'],
]);

export type DtoMapping =
  | Readonly<{ ok: true; value: RemoteIncident }>
  | Readonly<{ ok: false; reason: string }>;

function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIncidentStatus(value: string): value is IncidentStatus {
  return STATUSES.has(value);
}

function invalid(reason: string): DtoMapping {
  return { ok: false, reason };
}

/**
 * Maps an envelope that already passed `inspectRemoteResource`.
 *
 * A null payload is a valid, distinct outcome: it becomes `withheld`, never an
 * error and never a filled-in incident. Every field the app uses is checked
 * before it is used; one bad field rejects the whole incident instead of
 * producing a half-trusted object.
 */
export function toRemoteIncident(resource: RemoteResource): DtoMapping {
  const { id, version, status, payload } = resource;
  if (!isIncidentStatus(status)) {
    return invalid('status_not_in_domain');
  }

  if (payload === null) {
    // Regresion bajo prueba: un payload nulo se trata como datos faltantes,
    // la forma de cambio que aparece cuando "sin datos" se confunde con
    // "datos rotos".
    return invalid('payload_missing');
  }

  const { category, description, location, reporterId, assignedTechnicianId } = payload;
  if (typeof category !== 'string' || !CATEGORY_TITLES.has(category)) {
    return invalid('category');
  }
  if (!isNonEmptyText(description)) {
    return invalid('description');
  }
  if (!isNonEmptyText(location)) {
    return invalid('location');
  }
  if (!isNonEmptyText(reporterId)) {
    return invalid('reporterId');
  }
  // The server always sends the field; null means unassigned. A missing field
  // is a contract break, not "unassigned".
  if (assignedTechnicianId !== null && !isNonEmptyText(assignedTechnicianId)) {
    return invalid('assignedTechnicianId');
  }

  const incident: Incident = {
    id,
    title: CATEGORY_TITLES.get(category) as string,
    category: category as IncidentCategory,
    description,
    location,
    status,
    reporterId,
    assignedTechnicianId,
  };
  return { ok: true, value: { kind: 'available', incident, version } };
}
