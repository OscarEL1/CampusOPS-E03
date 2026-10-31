import { createLocationCache, createLocationLookup, normalizeQuery } from '../src/campusops/application/locationLookup';
import { selectIncidentLocation, type GeocodingProvider, type GeocodingResult } from '../src/campusops/domain/incidentLocation';
import {
  DEFAULT_RETRY_LIMITS,
  backoffDelayMs,
  planRetry,
  worstCaseWaitMs,
  type RetryLimits,
} from '../src/campusops/domain/retryPolicy';
import { planRetry as evaluatedPlanRetry, selectIncidentLocation as evaluatedSelect } from '../src/course-evaluation';

/** Week 09: retry policy, location selection, cache and lookup as pure logic with fakes. */

const KEY = 'resolve-campus-inc-001-op-1';

describe('planRetry', () => {
  test('retries transient GET failures with progressive, capped waits and stops from attempt 4', () => {
    const delays = [1, 2, 3].map((attempt) => planRetry({ method: 'GET', status: 'timeout', attempt }));
    expect(delays).toEqual([
      { retry: true, delayMs: 250, requiresStableIdempotencyKey: false },
      { retry: true, delayMs: 500, requiresStableIdempotencyKey: false },
      { retry: true, delayMs: 1000, requiresStableIdempotencyKey: false },
    ]);
    for (const attempt of [4, 5, 50]) {
      expect(planRetry({ method: 'GET', status: 'timeout', attempt })).toEqual({ retry: false, delayMs: 0, requiresStableIdempotencyKey: false });
    }
  });

  test.each([408, 429, 500, 502, 503, 504, 'timeout' as const])('%s is retryable', (status) => {
    expect(planRetry({ method: 'GET', status, attempt: 1 }).retry).toBe(true);
  });

  test.each([400, 401, 403, 404, 409, 422])('%s is a decision of the server and is not retried', (status) => {
    expect(planRetry({ method: 'GET', status, attempt: 1 })).toEqual({ retry: false, delayMs: 0, requiresStableIdempotencyKey: false });
    expect(planRetry({ method: 'POST', status, attempt: 1, idempotencyKey: KEY }).retry).toBe(false);
  });

  test('honours a valid Retry-After exactly and refuses to wait longer than the limit', () => {
    expect(planRetry({ method: 'GET', status: 429, attempt: 1, retryAfterMs: 800 })).toEqual({
      retry: true,
      delayMs: 800,
      requiresStableIdempotencyKey: false,
    });
    expect(planRetry({ method: 'GET', status: 503, attempt: 2, retryAfterMs: 1200 }).delayMs).toBe(1200);
    expect(planRetry({ method: 'GET', status: 429, attempt: 1, retryAfterMs: DEFAULT_RETRY_LIMITS.maxRetryAfterMs + 1 })).toEqual({
      retry: false,
      delayMs: 0,
      requiresStableIdempotencyKey: false,
    });
  });

  test.each([Number.NaN, -1, Number.POSITIVE_INFINITY])('an unusable Retry-After (%s) falls back to the progressive wait', (retryAfterMs) => {
    expect(planRetry({ method: 'GET', status: 429, attempt: 2, retryAfterMs })).toEqual({
      retry: true,
      delayMs: 500,
      requiresStableIdempotencyKey: false,
    });
  });

  test('a POST is repeated only with a stable idempotency key', () => {
    expect(planRetry({ method: 'POST', status: 503, attempt: 1 })).toEqual({ retry: false, delayMs: 0, requiresStableIdempotencyKey: true });
    expect(planRetry({ method: 'POST', status: 'timeout', attempt: 1, idempotencyKey: 'short' })).toEqual({
      retry: false,
      delayMs: 0,
      requiresStableIdempotencyKey: true,
    });
    expect(planRetry({ method: 'POST', status: 'timeout', attempt: 1, idempotencyKey: KEY })).toEqual({
      retry: true,
      delayMs: 250,
      requiresStableIdempotencyKey: false,
    });
    expect(planRetry({ method: 'POST', status: 'timeout', attempt: 4, idempotencyKey: KEY }).retry).toBe(false);
  });

  test.each([0, -1, 1.5, Number.NaN])('an invalid attempt number (%s) is never retried', (attempt) => {
    expect(planRetry({ method: 'GET', status: 'timeout', attempt }).retry).toBe(false);
  });

  test('limits are configurable and every wait stays finite and bounded', () => {
    const strict: RetryLimits = { maxAttempts: 2, baseDelayMs: 100, maxDelayMs: 300, maxRetryAfterMs: 1000 };
    expect(planRetry({ method: 'GET', status: 500, attempt: 1 }, strict)).toEqual({ retry: true, delayMs: 100, requiresStableIdempotencyKey: false });
    expect(planRetry({ method: 'GET', status: 500, attempt: 2 }, strict).retry).toBe(false);
    for (let attempt = 1; attempt <= 200; attempt += 1) {
      const delay = backoffDelayMs(attempt, DEFAULT_RETRY_LIMITS);
      expect(Number.isFinite(delay)).toBe(true);
      expect(delay).toBeLessThanOrEqual(DEFAULT_RETRY_LIMITS.maxDelayMs);
    }
    expect(worstCaseWaitMs(DEFAULT_RETRY_LIMITS)).toBe(15000);
    expect(worstCaseWaitMs(strict)).toBe(1000);
  });

  test('the evaluated adapter is the same policy', () => {
    const input = { method: 'GET' as const, status: 429, attempt: 1, retryAfterMs: 800 };
    expect(evaluatedPlanRetry(input)).toEqual(planRetry(input));
  });
});

describe('selectIncidentLocation', () => {
  test('accepts a provider answer with a label and coordinates in range, copying only those fields', () => {
    expect(selectIncidentLocation({ label: ' Zona de prueba ', latitude: 0, longitude: 0, extra: 'x' }, 'Edificio manual')).toEqual({
      source: 'provider',
      label: 'Zona de prueba',
      latitude: 0,
      longitude: 0,
    });
    for (const [latitude, longitude] of [[90, 180], [-90, -180]]) {
      expect(selectIncidentLocation({ label: 'Límite', latitude, longitude }, 'Manual').source).toBe('provider');
    }
  });

  test.each([
    ['null', null],
    ['an error as data', { status: 429 }],
    ['no coordinates', { label: 'Incompleta' }],
    ['latitude out of range', { label: 'Inválida', latitude: 91, longitude: 0 }],
    ['longitude out of range', { label: 'Inválida', latitude: 0, longitude: 180.5 }],
    ['the double with invalid coordinates', { label: 'Zona ficticia', latitude: 999, longitude: null }],
    ['coordinates as text', { label: 'Texto', latitude: '19.0', longitude: '-98.2' }],
    ['non finite coordinates', { label: 'Infinita', latitude: Number.NaN, longitude: Number.POSITIVE_INFINITY }],
    ['an empty label', { label: '   ', latitude: 1, longitude: 1 }],
    ['a list', [{ label: 'Lista', latitude: 1, longitude: 1 }]],
    ['a string', 'Edificio A'],
  ])('keeps the manual label for %s, without coordinates', (_name, value) => {
    const result = selectIncidentLocation(value, '  Edificio B, planta baja  ');
    expect(result).toEqual({ source: 'manual', label: 'Edificio B, planta baja' });
    expect(result).not.toHaveProperty('latitude');
  });

  test('the evaluated adapter is the same rule', () => {
    expect(evaluatedSelect({ label: 'Zona de prueba', latitude: 0, longitude: 0 }, 'M')).toEqual(
      selectIncidentLocation({ label: 'Zona de prueba', latitude: 0, longitude: 0 }, 'M'),
    );
  });
});

function manualClock(start = 1_000) {
  let time = start;
  return { now: () => time, advance: (ms: number) => (time += ms) };
}

function fakeProvider(answers: GeocodingResult[]) {
  const queries: string[] = [];
  const provider: GeocodingProvider = {
    name: 'fake',
    async geocode(query) {
      queries.push(query);
      return answers.shift() ?? { kind: 'unavailable', reason: 'network' };
    },
  };
  return { provider, queries };
}

const FOUND: GeocodingResult = { kind: 'candidate', candidate: { label: 'Edificio de prueba A', latitude: 0, longitude: 0 } };

describe('location cache', () => {
  test('normalises the query, expires entries and evicts the least recently used', () => {
    const clock = manualClock();
    const cache = createLocationCache({ clock, ttlMs: 1000, maxEntries: 2 });
    const location = { source: 'provider' as const, label: 'A', latitude: 1, longitude: 1 };
    expect(normalizeQuery('  Edificio   DE prueba ')).toBe('edificio de prueba');
    cache.set('Edificio A', location);
    expect(cache.get('  edificio   a ')).toEqual(location);
    cache.set('Edificio B', { ...location, label: 'B' });
    cache.get('edificio a');
    cache.set('Edificio C', { ...location, label: 'C' });
    expect(cache.get('edificio b')).toBeNull();
    expect(cache.get('edificio a')).toEqual(location);
    clock.advance(1000);
    expect(cache.get('edificio a')).toBeNull();
  });
});

describe('location lookup', () => {
  test('a valid answer is used and cached: the second lookup does not call the provider', async () => {
    const clock = manualClock();
    const { provider, queries } = fakeProvider([FOUND]);
    const lookup = createLocationLookup({ provider, cache: createLocationCache({ clock }), clock });
    const first = await lookup.lookup('Edificio de prueba A', 'Manual');
    const second = await lookup.lookup('edificio de prueba a', 'Manual');
    expect(first).toEqual({ kind: 'resolved', location: { source: 'provider', label: 'Edificio de prueba A', latitude: 0, longitude: 0 }, origin: 'provider', fallbackReason: null });
    expect(second).toMatchObject({ kind: 'resolved', origin: 'cache' });
    expect(queries).toEqual(['Edificio de prueba A']);
  });

  test.each([
    ['timeout'],
    ['rate_limited'],
    ['network'],
    ['server_error'],
    ['invalid_response'],
    ['not_found'],
  ] as const)('when the provider is unavailable (%s) the manual label is kept and nothing is cached', async (reason) => {
    const clock = manualClock();
    const cache = createLocationCache({ clock });
    const { provider } = fakeProvider([{ kind: 'unavailable', reason }]);
    const lookup = createLocationLookup({ provider, cache, clock });
    await expect(lookup.lookup('Edificio X', 'Edificio X, zona norte')).resolves.toEqual({
      kind: 'resolved',
      location: { source: 'manual', label: 'Edificio X, zona norte' },
      origin: 'manual',
      fallbackReason: reason,
    });
    expect(cache.size()).toBe(0);
  });

  test('invalid data from the provider is not cached and falls back to the manual label', async () => {
    const clock = manualClock();
    const cache = createLocationCache({ clock });
    const { provider } = fakeProvider([{ kind: 'candidate', candidate: { label: 'Zona ficticia', latitude: 999, longitude: null } }]);
    const lookup = createLocationLookup({ provider, cache, clock });
    await expect(lookup.lookup('Zona', 'Zona sur')).resolves.toMatchObject({ origin: 'manual', fallbackReason: 'invalid_data' });
    expect(cache.size()).toBe(0);
  });

  test('without a manual label the person is asked for one; an empty query never calls the provider', async () => {
    const clock = manualClock();
    const { provider, queries } = fakeProvider([{ kind: 'unavailable', reason: 'timeout' }]);
    const lookup = createLocationLookup({ provider, cache: createLocationCache({ clock }), clock });
    await expect(lookup.lookup('Edificio X', '   ')).resolves.toEqual({ kind: 'manual_required', fallbackReason: 'timeout' });
    await expect(lookup.lookup('   ', 'Biblioteca, primer piso')).resolves.toMatchObject({ origin: 'manual', fallbackReason: 'empty_query' });
    expect(queries).toHaveLength(1);
  });

  test('a provider that throws is treated as a disconnection', async () => {
    const clock = manualClock();
    const provider: GeocodingProvider = {
      name: 'broken',
      geocode: () => Promise.reject(new Error('socket closed')),
    };
    const lookup = createLocationLookup({ provider, cache: createLocationCache({ clock }), clock });
    await expect(lookup.lookup('Edificio X', 'Manual')).resolves.toMatchObject({ origin: 'manual', fallbackReason: 'network' });
  });

  test('lookup logs carry the outcome but never the query, the label or the coordinates', async () => {
    const clock = manualClock();
    const entries: unknown[] = [];
    const { provider } = fakeProvider([{ kind: 'candidate', candidate: { label: 'Edificio Secreto Ficticio', latitude: 12.345, longitude: 67.891 } }]);
    const lookup = createLocationLookup({ provider, cache: createLocationCache({ clock }), clock, log: (entry) => entries.push(entry) });
    await lookup.lookup('Consulta privada ficticia', 'Etiqueta manual ficticia');
    const text = JSON.stringify(entries);
    expect(entries).toEqual([{ event: 'location.lookup', provider: 'fake', outcome: 'provider', fallbackReason: null, durationMs: 0 }]);
    for (const secret of ['Consulta privada', 'Edificio Secreto', 'Etiqueta manual', '12.345', '67.891']) {
      expect(text).not.toContain(secret);
    }
  });
});
