import type { GeocodingFailure, GeocodingProvider, GeocodingResult } from '../../domain/incidentLocation';
import { redactSensitive } from '../../domain/logRedaction';
import { DEFAULT_RETRY_LIMITS, planRetry, realSleep, type RetryOptions } from '../../domain/retryPolicy';
import type { AccessTokenSource } from '../../domain/session';
import type { FetchLike, LogSink } from './httpIncidentGateway';
import { isPlainObject } from './remoteResource';

/**
 * Geocoding adapters (week 09).
 *
 * - `course`: the controlled double of the course backend, GET /v1/geocoding,
 *   with its published failure variants. Used by the tests to reproduce
 *   faults without quotas or availability of an external service.
 * - `open-meteo`: Open-Meteo's public geocoding API, no key and no account.
 *   Free for non-commercial use with fair usage; no service level. Used for
 *   the real execution and selectable in the app.
 *
 * Both share the same resilience: a deadline per attempt, retries planned by
 * planRetry (GET is idempotent), and one sanitised log entry per attempt with
 * provider, attempt, outcome, HTTP status and times; never the query or the
 * coordinates. A disconnection is not retried. Nothing here rejects.
 */

export const OPEN_METEO_SEARCH_URL = 'https://geocoding-api.open-meteo.com/v1/search';
export const DEFAULT_GEOCODING_TIMEOUT_MS = 4000;

type Attempt =
  | Readonly<{ kind: 'response'; status: number; retryAfterMs: number | null; text: string }>
  | Readonly<{ kind: 'timeout' }>
  | Readonly<{ kind: 'network' }>;

type ResilientSettings = Readonly<{
  name: string;
  fetchImpl: FetchLike;
  timeoutMs?: number;
  retry?: RetryOptions;
  log?: LogSink;
  now?: () => number;
  /** Builds the request; null when there are no credentials to send it with. */
  request(query: string): Promise<Readonly<{ url: string; headers: Readonly<Record<string, string>> }> | null>;
  /** Turns a 200 body into a candidate, or explains why it is not one. */
  parse(json: unknown): GeocodingResult;
}>;

function parseRetryAfter(value: string | null): number | null {
  return value !== null && /^\d+$/.test(value.trim()) ? Number(value.trim()) * 1000 : null;
}

function failureFor(status: number): GeocodingFailure {
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server_error';
  return 'rejected';
}

async function getOnce(
  fetchImpl: FetchLike,
  url: string,
  headers: Readonly<Record<string, string>>,
  timeoutMs: number,
): Promise<Attempt> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<Attempt>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ kind: 'timeout' });
    }, timeoutMs);
  });
  const attempt = (async (): Promise<Attempt> => {
    try {
      const response = await fetchImpl(url, { method: 'GET', headers: { ...headers }, signal: controller.signal });
      if (typeof response.status !== 'number') {
        return { kind: 'network' };
      }
      const text = await response.text();
      return { kind: 'response', status: response.status, retryAfterMs: parseRetryAfter(response.headers.get('retry-after')), text };
    } catch {
      return controller.signal.aborted ? { kind: 'timeout' } : { kind: 'network' };
    }
  })();
  try {
    return await Promise.race([attempt, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

function createResilientProvider(settings: ResilientSettings): GeocodingProvider {
  const now = settings.now ?? (() => Date.now());
  const timeoutMs = settings.timeoutMs ?? DEFAULT_GEOCODING_TIMEOUT_MS;
  const limits = settings.retry?.limits ?? DEFAULT_RETRY_LIMITS;
  const sleep = settings.retry?.sleep ?? realSleep;

  function log(entry: Record<string, unknown>): void {
    try {
      settings.log?.(redactSensitive({ event: 'geocoding.attempt', provider: settings.name, ...entry }));
    } catch {
      // A failing log sink never changes the result.
    }
  }

  return {
    name: settings.name,
    async geocode(query) {
      const prepared = await settings.request(query);
      if (prepared === null) {
        return { kind: 'unavailable', reason: 'unauthorized' };
      }
      for (let attempt = 1; ; attempt += 1) {
        const startedAt = now();
        const outcome = await getOnce(settings.fetchImpl, prepared.url, prepared.headers, timeoutMs);
        const durationMs = Math.max(0, now() - startedAt);
        let result: GeocodingResult;
        let signal: number | 'timeout' | null = null;
        let retryAfterMs: number | undefined;
        if (outcome.kind === 'network') {
          result = { kind: 'unavailable', reason: 'network' };
        } else if (outcome.kind === 'timeout') {
          result = { kind: 'unavailable', reason: 'timeout' };
          signal = 'timeout';
        } else if (outcome.status === 200) {
          let json: unknown;
          try {
            json = JSON.parse(outcome.text);
            result = settings.parse(json);
          } catch {
            result = { kind: 'unavailable', reason: 'invalid_response' };
          }
        } else {
          result = { kind: 'unavailable', reason: failureFor(outcome.status) };
          signal = outcome.status;
          retryAfterMs = outcome.retryAfterMs ?? undefined;
        }
        const decision =
          signal === null || settings.retry === undefined
            ? { retry: false, delayMs: 0 }
            : planRetry({ method: 'GET', status: signal, attempt, ...(retryAfterMs === undefined ? {} : { retryAfterMs }) }, limits);
        log({
          attempt,
          outcome: result.kind === 'candidate' ? 'answered' : result.reason,
          status: outcome.kind === 'response' ? outcome.status : null,
          durationMs,
          nextDelayMs: decision.retry ? decision.delayMs : null,
        });
        if (!decision.retry) {
          return result;
        }
        await sleep(decision.delayMs);
      }
    },
  };
}

export type CourseGeocodingOptions = Readonly<{
  baseUrl: string;
  session: AccessTokenSource;
  fetchImpl: FetchLike;
  /** Selects a published variant of the double. For controlled tests only. */
  scenario?: string;
  timeoutMs?: number;
  retry?: RetryOptions;
  log?: LogSink;
  now?: () => number;
}>;

let geocodeSequence = 0;

export function createCourseGeocodingProvider(options: CourseGeocodingOptions): GeocodingProvider {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  return createResilientProvider({
    name: 'course-double',
    fetchImpl: options.fetchImpl,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.retry === undefined ? {} : { retry: options.retry }),
    ...(options.log === undefined ? {} : { log: options.log }),
    ...(options.now === undefined ? {} : { now: options.now }),
    async request(query) {
      geocodeSequence += 1;
      const credentials = await options.session.authorize(`geocode-${String(geocodeSequence)}`);
      if (credentials === null) {
        return null;
      }
      const headers: Record<string, string> = {
        Accept: 'application/json',
        Authorization: `Bearer ${credentials.accessToken}`,
        'X-Course-Actor': credentials.actorId,
      };
      if (options.scenario !== undefined) {
        headers['X-Course-Scenario'] = options.scenario;
      }
      return { url: `${baseUrl}/v1/geocoding?q=${encodeURIComponent(query)}`, headers };
    },
    parse: (json) => ({ kind: 'candidate', candidate: json }),
  });
}

export type OpenMeteoOptions = Readonly<{
  fetchImpl: FetchLike;
  timeoutMs?: number;
  retry?: RetryOptions;
  log?: LogSink;
  now?: () => number;
  language?: string;
}>;

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function createOpenMeteoGeocodingProvider(options: OpenMeteoOptions): GeocodingProvider {
  return createResilientProvider({
    name: 'open-meteo',
    fetchImpl: options.fetchImpl,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.retry === undefined ? {} : { retry: options.retry }),
    ...(options.log === undefined ? {} : { log: options.log }),
    ...(options.now === undefined ? {} : { now: options.now }),
    async request(query) {
      const params = `name=${encodeURIComponent(query)}&count=1&language=${options.language ?? 'es'}&format=json`;
      return { url: `${OPEN_METEO_SEARCH_URL}?${params}`, headers: { Accept: 'application/json' } };
    },
    parse(json) {
      if (!isPlainObject(json)) {
        return { kind: 'unavailable', reason: 'invalid_response' };
      }
      if (json.results === undefined || (Array.isArray(json.results) && json.results.length === 0)) {
        return { kind: 'unavailable', reason: 'not_found' };
      }
      const first: unknown = Array.isArray(json.results) ? json.results[0] : undefined;
      if (!isPlainObject(first)) {
        return { kind: 'unavailable', reason: 'invalid_response' };
      }
      const label = [first.name, first.admin1, first.country].filter(nonEmpty).join(', ');
      // Coordinates stay unvalidated here: selectIncidentLocation decides.
      return { kind: 'candidate', candidate: { label, latitude: first.latitude, longitude: first.longitude } };
    },
  });
}
