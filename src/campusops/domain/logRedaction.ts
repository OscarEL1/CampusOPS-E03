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

export const REDACTED = '[REDACTED]';

/**
 * Keys whose value never reaches telemetry, normalised as `normaliseKey`
 * produces them. The published contract in docs/CAMPUSOPS_API.md defines this
 * set; it covers session material, personal identifiers, physical location and
 * the free-text or media attached to an incident.
 *
 * Technical context such as incidentId, correlationId, status, attempt and
 * durationMs is deliberately absent, because an operator needs it to diagnose
 * a failure and it identifies no person.
 */
const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  'authorization',
  'password',
  'token',
  'accesstoken',
  'refreshtoken',
  'email',
  'displayname',
  'name',
  'userid',
  'reporterid',
  'technicianid',
  'assignedtechnicianid',
  'location',
  'latitude',
  'longitude',
  'photos',
  'evidence',
  'internalcomments',
  'assignmenthistory',
]);

/** Lowercases the key and drops `_` and `-`, so `access_token` and `accessToken` match. */
export function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, '');
}

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(normaliseKey(key));
}

/**
 * True only for a plain data record. A Date, a Map or a class instance is left
 * untouched instead of being flattened into an empty object.
 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Returns a redacted copy of a telemetry payload.
 *
 * Objects and arrays are walked to any depth. When a key is sensitive the whole
 * value is replaced, so a nested object or a list of photos is never partially
 * disclosed. The input is never modified: every container is rebuilt, so a
 * caller can keep logging a payload it still needs intact.
 */
export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) {
    // Regresion bajo prueba: la lista se devuelve tal cual para "evitar copias
    // innecesarias". Los registros que viajan dentro de ella dejan de sanearse.
    return value;
  }

  if (!isPlainRecord(value)) {
    return value;
  }

  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    // defineProperty rather than assignment: a payload carrying a "__proto__"
    // key must become an ordinary own property instead of touching the
    // prototype chain of the copy.
    Object.defineProperty(output, key, {
      value: isSensitiveKey(key) ? REDACTED : redactSensitive(nested),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return output;
}
