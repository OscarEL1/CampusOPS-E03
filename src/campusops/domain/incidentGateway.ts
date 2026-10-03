import type { IncidentCategory, IncidentStatus } from '../contracts';
import type { Incident } from './incident';

/** What the app knows about an incident whose details the server withheld. */
export type IncidentSummary = Readonly<{
  id: string;
  version: number;
  status: IncidentStatus;
}>;

/**
 * An incident received from the server, after validation.
 *
 * - `available`: the payload passed validation and was mapped to a domain
 *   incident; `version` is the server version a later write must quote.
 * - `withheld`: the envelope was valid but its payload was null. The contract
 *   allows that, so it is neither an error nor an invalid response. The app
 *   knows the id, version and status and nothing else, and must not invent
 *   the category, description or location it was not given.
 */
export type RemoteIncident =
  | Readonly<{ kind: 'available'; incident: Incident; version: number }>
  | Readonly<{ kind: 'withheld'; summary: IncidentSummary }>;

/**
 * Every way a remote call can fail, each one distinguishable so the screen can
 * say something true about it. `invalid_response` covers both bytes that are
 * not JSON and JSON that breaks the contract; it never means "empty".
 */
export type RemoteFailure =
  | Readonly<{ kind: 'timeout'; timeoutMs: number }>
  | Readonly<{ kind: 'network' }>
  | Readonly<{ kind: 'server_error'; status: number }>
  | Readonly<{ kind: 'rate_limited'; retryAfterMs: number | null }>
  | Readonly<{ kind: 'unauthorized' }>
  | Readonly<{ kind: 'forbidden' }>
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'rejected'; status: number; code: string | null }>
  | Readonly<{ kind: 'invalid_response'; reason: string }>;

export type RemoteFailureKind = RemoteFailure['kind'];

export type RemoteResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; failure: RemoteFailure }>;

/** What a reporter sends to create an incident. */
export type NewIncident = Readonly<{
  category: IncidentCategory;
  description: string;
  location: string;
}>;

/** A created incident; `duplicate` is true when the server replayed a stored result. */
export type CreatedIncident = Readonly<{
  incident: RemoteIncident;
  duplicate: boolean;
}>;

/**
 * Port for reading and creating incidents on a remote service.
 *
 * Implementations never reject: every outcome, including a timeout, a refused
 * connection or bytes that are not JSON, resolves to a `RemoteResult`. A
 * caller therefore cannot leave an exception uncaught by forgetting a catch.
 */
export interface IncidentGateway {
  list(): Promise<RemoteResult<readonly RemoteIncident[]>>;
  get(id: string): Promise<RemoteResult<RemoteIncident>>;
  create(input: NewIncident, idempotencyKey: string): Promise<RemoteResult<CreatedIncident>>;
}
