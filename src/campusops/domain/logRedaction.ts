import type { IncidentCategory, IncidentStatus } from '../contracts';
import type { Incident } from './incident';

/**
 * Fields an incident is allowed to contribute to a log record.
 *
 * This is an allowlist, not a list of fields to strip: the record is built by
 * copying these three values, so a sensitive field added to Incident later
 * cannot reach a sink by being forgotten in a deny list.
 */
export type IncidentLogFields = Readonly<{
  id: string;
  category: IncidentCategory;
  status: IncidentStatus;
}>;

/**
 * Reduces an incident to the fields that may be logged. Free text, physical
 * location and the identifiers of the people involved are never copied.
 */
export function redactIncidentForLog(incident: Incident): IncidentLogFields {
  return {
    id: incident.id,
    category: incident.category,
    status: incident.status,
  };
}
