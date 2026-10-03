import type {
  CreatedIncident,
  IncidentGateway,
  NewIncident,
  RemoteFailure,
  RemoteIncident,
  RemoteResult,
} from '../../domain/incidentGateway';
import { redactSensitive } from '../../domain/logRedaction';
import { toRemoteIncident } from './incidentDto';
import { inspectRemoteResource, isPlainObject } from './remoteResource';

/** The part of a fetch Response the client reads. A real Response satisfies it. */
export type HttpResponseLike = Readonly<{
  status: number;
  headers: Readonly<{ get(name: string): string | null }>;
  text(): Promise<string>;
}>;

export type HttpRequest = Readonly<{
  method: 'GET' | 'POST';
  headers: Readonly<Record<string, string>>;
  body?: string;
  signal: AbortSignal;
}>;

/** Injected transport, so tests never need the network or a real provider. */
export type FetchLike = (url: string, init: HttpRequest) => Promise<HttpResponseLike>;

export type LogSink = (entry: unknown) => void;

export type HttpIncidentGatewayOptions = Readonly<{
  baseUrl: string;
  /** Supplied by the composition root; this module never holds a credential. */
  accessToken: string;
  actorId: string;
  fetchImpl: FetchLike;
  timeoutMs?: number;
  /** Selects a published backend variant. For controlled tests and demos only. */
  scenario?: string;
  log?: LogSink;
  now?: () => number;
}>;

export const DEFAULT_TIMEOUT_MS = 8000;

type Operation = 'list' | 'get' | 'create';

type Exchange =
  | Readonly<{ ok: true; json: unknown }>
  | Readonly<{ ok: false; failure: RemoteFailure }>;

type Transport =
  | Readonly<{ kind: 'response'; status: number; retryAfter: string | null; text: string }>
  | Readonly<{ kind: 'transport_error' }>;

function failure<T>(value: RemoteFailure): RemoteResult<T> {
  return { ok: false, failure: value };
}

function invalid<T>(reason: string): RemoteResult<T> {
  return failure<T>({ kind: 'invalid_response', reason });
}

/** Retry-After in whole seconds, as the course backend sends it. Anything else is unknown. */
function parseRetryAfter(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value.trim())) {
    return null;
  }
  return Number(value.trim()) * 1000;
}

/** Reads `{ code }` from an error body without ever throwing. */
function readErrorCode(text: string): string | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return isPlainObject(parsed) && typeof parsed.code === 'string' ? parsed.code : null;
  } catch {
    return null;
  }
}

function classify(transport: Extract<Transport, { kind: 'response' }>): Exchange {
  const { status, text, retryAfter } = transport;
  if (status >= 200 && status < 300) {
    try {
      return { ok: true, json: JSON.parse(text) as unknown };
    } catch {
      return { ok: false, failure: { kind: 'invalid_response', reason: 'not_json' } };
    }
  }
  if (status === 401) {
    return { ok: false, failure: { kind: 'unauthorized' } };
  }
  if (status === 403) {
    return { ok: false, failure: { kind: 'forbidden' } };
  }
  if (status === 404) {
    return { ok: false, failure: { kind: 'not_found' } };
  }
  if (status === 429) {
    return { ok: false, failure: { kind: 'rate_limited', retryAfterMs: parseRetryAfter(retryAfter) } };
  }
  if (status >= 500) {
    return { ok: false, failure: { kind: 'server_error', status } };
  }
  return { ok: false, failure: { kind: 'rejected', status, code: readErrorCode(text) } };
}

function parseIncident(json: unknown, context: string): RemoteResult<RemoteIncident> {
  const envelope = inspectRemoteResource(json);
  if (!envelope.ok) {
    return invalid(`${context}_${envelope.violation}`);
  }
  const mapped = toRemoteIncident(envelope.value);
  if (!mapped.ok) {
    return invalid(`${context}_${mapped.reason}`);
  }
  return { ok: true, value: mapped.value };
}

export function createHttpIncidentGateway(options: HttpIncidentGatewayOptions): IncidentGateway {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const timeoutMs =
    typeof options.timeoutMs === 'number' && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
      ? options.timeoutMs
      : DEFAULT_TIMEOUT_MS;
  const log = options.log ?? (() => undefined);
  const now = options.now ?? (() => Date.now());

  function headersFor(extra: Readonly<Record<string, string>>): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${options.accessToken}`,
      'X-Course-Actor': options.actorId,
      ...extra,
    };
    if (options.scenario !== undefined) {
      headers['X-Course-Scenario'] = options.scenario;
    }
    return headers;
  }

  /**
   * One HTTP exchange bounded by the client's own deadline. The deadline races
   * the whole exchange, body included, so a server that accepts the connection
   * and then stalls still ends in `timeout` instead of a hung screen. Nothing
   * here rejects: a refused connection, an abort and a thrown fetch all become
   * a typed failure.
   */
  async function exchange(
    method: 'GET' | 'POST',
    path: string,
    body?: string,
    extraHeaders: Readonly<Record<string, string>> = {},
  ): Promise<Exchange> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve('timeout');
      }, timeoutMs);
    });
    const attempt = (async (): Promise<Transport> => {
      try {
        const init: HttpRequest =
          body === undefined
            ? { method, headers: headersFor(extraHeaders), signal: controller.signal }
            : {
                method,
                headers: headersFor({ 'Content-Type': 'application/json', ...extraHeaders }),
                body,
                signal: controller.signal,
              };
        const response = await options.fetchImpl(`${baseUrl}${path}`, init);
        const text = await response.text();
        return { kind: 'response', status: response.status, retryAfter: response.headers.get('retry-after'), text };
      } catch {
        return { kind: 'transport_error' };
      }
    })();

    try {
      const outcome = await Promise.race([attempt, deadline]);
      if (outcome === 'timeout') {
        return { ok: false, failure: { kind: 'timeout', timeoutMs } };
      }
      if (outcome.kind === 'transport_error') {
        return {
          ok: false,
          failure: controller.signal.aborted ? { kind: 'timeout', timeoutMs } : { kind: 'network' },
        };
      }
      return classify(outcome);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Emits one technical record per operation. It carries the operation, the
   * outcome kind, the HTTP status when there is one and the duration. It never
   * carries the URL, a header, a request body or incident content, and it still
   * passes through the week 04 sanitisation rule as a second guard.
   */
  function record<T>(
    operation: Operation,
    startedAt: number,
    result: RemoteResult<T>,
    details: Readonly<Record<string, unknown>> = {},
  ): RemoteResult<T> {
    const durationMs = Math.max(0, now() - startedAt);
    const entry: Record<string, unknown> = result.ok
      ? { event: 'incidents.remote.ok', operation, durationMs, ...details }
      : { event: 'incidents.remote.failure', operation, durationMs, kind: result.failure.kind };
    if (!result.ok) {
      const cause = result.failure;
      if (cause.kind === 'server_error' || cause.kind === 'rejected') {
        entry.status = cause.status;
      }
      if (cause.kind === 'invalid_response') {
        entry.reason = cause.reason;
      }
      if (cause.kind === 'rate_limited') {
        entry.retryAfterMs = cause.retryAfterMs;
      }
    }
    try {
      log(redactSensitive(entry));
    } catch {
      // A failing log sink must never turn a result into an exception.
    }
    return result;
  }

  return {
    async list() {
      const startedAt = now();
      const response = await exchange('GET', '/v1/incidents');
      if (!response.ok) {
        return record('list', startedAt, failure(response.failure));
      }
      const { json } = response;
      if (!isPlainObject(json) || !Array.isArray(json.items)) {
        return record('list', startedAt, invalid('list_shape'));
      }
      const incidents: RemoteIncident[] = [];
      for (const [index, item] of json.items.entries()) {
        const parsed = parseIncident(item, `item_${index}`);
        if (!parsed.ok) {
          // One item that breaks the contract rejects the whole list: showing
          // the rest would hide that the server and the client disagree.
          return record('list', startedAt, parsed);
        }
        incidents.push(parsed.value);
      }
      const withheld = incidents.filter((item) => item.kind === 'withheld').length;
      return record('list', startedAt, { ok: true, value: incidents }, { count: incidents.length, withheld });
    },

    async get(id) {
      const startedAt = now();
      const response = await exchange('GET', `/v1/incidents/${encodeURIComponent(id)}`);
      if (!response.ok) {
        return record('get', startedAt, failure(response.failure));
      }
      const parsed = parseIncident(response.json, 'incident');
      if (!parsed.ok) {
        return record('get', startedAt, parsed);
      }
      const receivedId = parsed.value.kind === 'available' ? parsed.value.incident.id : parsed.value.summary.id;
      if (receivedId !== id) {
        return record('get', startedAt, invalid('incident_id_mismatch'));
      }
      return record('get', startedAt, parsed, { incidentId: receivedId, withheld: parsed.value.kind === 'withheld' });
    },

    async create(input: NewIncident, idempotencyKey: string) {
      const startedAt = now();
      // Only the three contract fields are sent, never a spread of the caller's object.
      const body = JSON.stringify({ category: input.category, description: input.description, location: input.location });
      const response = await exchange('POST', '/v1/incidents', body, { 'Idempotency-Key': idempotencyKey });
      if (!response.ok) {
        return record('create', startedAt, failure(response.failure));
      }
      const { json } = response;
      if (!isPlainObject(json) || typeof json.duplicate !== 'boolean') {
        return record('create', startedAt, invalid('created_shape'));
      }
      const parsed = parseIncident(json.incident, 'created');
      if (!parsed.ok) {
        return record('create', startedAt, parsed);
      }
      const created: CreatedIncident = { incident: parsed.value, duplicate: json.duplicate };
      const incidentId = parsed.value.kind === 'available' ? parsed.value.incident.id : parsed.value.summary.id;
      return record('create', startedAt, { ok: true, value: created }, { incidentId, duplicate: json.duplicate });
    },
  };
}
