/**
 * Boundary validation for the envelope every CampusOps resource travels in.
 *
 * The published contract (docs/CAMPUSOPS_API.md, week 05) is
 * `{ id, version, status, payload }`: a non-empty id and status, a
 * non-negative integer version, and a payload that is an object or null.
 * Future envelope fields are ignored. This module is the single place that
 * decides whether bytes from the network are an envelope at all; the incident
 * mapper only ever receives a value that already passed here.
 */

export type RemotePayload = Readonly<Record<string, unknown>>;

/** An envelope that satisfied the contract. Unknown fields are not carried. */
export type RemoteResource = Readonly<{
  id: string;
  version: number;
  status: string;
  payload: RemotePayload | null;
}>;

/** Why an input is not an envelope. Used for diagnostics, never shown to a user. */
export type EnvelopeViolation =
  | 'not_an_object'
  | 'id'
  | 'version'
  | 'status'
  | 'payload';

export type EnvelopeInspection =
  | Readonly<{ ok: true; value: RemoteResource }>
  | Readonly<{ ok: false; violation: EnvelopeViolation }>;

/** Exact result shape published for the evaluated adapter. */
export type ParseResult =
  | Readonly<{ ok: true; value: RemoteResource }>
  | Readonly<{ ok: false; error: 'contract' }>;

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validates an envelope and reports which rule failed. The returned value is a
 * new object holding only the four contract fields, so a forward-compatible
 * extra field never reaches the rest of the app.
 */
export function inspectRemoteResource(input: unknown): EnvelopeInspection {
  if (!isPlainObject(input)) {
    return { ok: false, violation: 'not_an_object' };
  }
  const { id, version, status, payload } = input;
  if (!isNonEmptyText(id)) {
    return { ok: false, violation: 'id' };
  }
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
    return { ok: false, violation: 'version' };
  }
  if (!isNonEmptyText(status)) {
    return { ok: false, violation: 'status' };
  }
  if (payload !== null && !isPlainObject(payload)) {
    // An array, a string or a missing payload is not "an object or null".
    return { ok: false, violation: 'payload' };
  }
  return { ok: true, value: { id, version, status, payload } };
}

/**
 * The published adapter shape: a contract violation is reported only as
 * `{ ok: false, error: 'contract' }`, with no internal detail attached.
 */
export function parseRemoteResource(input: unknown): ParseResult {
  const inspection = inspectRemoteResource(input);
  return inspection.ok ? inspection : { ok: false, error: 'contract' };
}
