import {
  selectIncidentLocation,
  type GeocodingFailure,
  type GeocodingProvider,
  type SelectedLocation,
} from '../domain/incidentLocation';
import { redactSensitive } from '../domain/logRedaction';
import type { Clock } from '../domain/session';

/**
 * Looks up the location of an incident (week 09): cache first, then the
 * provider, and the label the person wrote whenever the provider cannot be
 * used. Only valid provider answers are cached, so a failure is retried on the
 * next lookup instead of being remembered. Logs carry the outcome, never the
 * query, the label or the coordinates.
 */

type ProviderLocation = Extract<SelectedLocation, { source: 'provider' }>;

export const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_CACHE_MAX_ENTRIES = 50;

export type LocationCache = Readonly<{
  get(query: string): ProviderLocation | null;
  set(query: string, location: ProviderLocation): void;
  size(): number;
}>;

/** Same place written differently is the same cache entry. */
export function normalizeQuery(query: string): string {
  return query.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** In-memory cache with expiry and least-recently-used eviction. */
export function createLocationCache(
  options: Readonly<{ clock: Clock; ttlMs?: number; maxEntries?: number }>,
): LocationCache {
  const ttlMs = options.ttlMs ?? DEFAULT_CACHE_TTL_MS;
  const maxEntries = options.maxEntries ?? DEFAULT_CACHE_MAX_ENTRIES;
  const entries = new Map<string, Readonly<{ location: ProviderLocation; storedAt: number }>>();
  return {
    get(query) {
      const key = normalizeQuery(query);
      const entry = entries.get(key);
      if (entry === undefined) {
        return null;
      }
      if (options.clock.now() - entry.storedAt >= ttlMs) {
        entries.delete(key);
        return null;
      }
      entries.delete(key);
      entries.set(key, entry);
      return entry.location;
    },
    set(query, location) {
      const key = normalizeQuery(query);
      entries.delete(key);
      entries.set(key, { location, storedAt: options.clock.now() });
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) {
          break;
        }
        entries.delete(oldest);
      }
    },
    size: () => entries.size,
  };
}

export type FallbackReason = GeocodingFailure | 'invalid_data' | 'empty_query';

export type LocationLookupResult =
  | Readonly<{
      kind: 'resolved';
      location: SelectedLocation;
      origin: 'cache' | 'provider' | 'manual';
      /** Why the provider was not used, when the manual label was kept. */
      fallbackReason: FallbackReason | null;
    }>
  /** The provider could not be used and there is no manual label yet: ask for one. */
  | Readonly<{ kind: 'manual_required'; fallbackReason: FallbackReason }>;

export type LocationLookup = Readonly<{
  providerName: string;
  lookup(query: string, manualLabel: string): Promise<LocationLookupResult>;
}>;

export function createLocationLookup(
  options: Readonly<{
    provider: GeocodingProvider;
    cache: LocationCache;
    clock: Clock;
    log?: (entry: unknown) => void;
  }>,
): LocationLookup {
  const { provider, cache, clock } = options;

  function record(result: LocationLookupResult, startedAt: number): LocationLookupResult {
    const entry = {
      event: 'location.lookup',
      provider: provider.name,
      outcome: result.kind === 'resolved' ? result.origin : 'manual_required',
      fallbackReason: result.fallbackReason,
      durationMs: Math.max(0, clock.now() - startedAt),
    };
    try {
      options.log?.(redactSensitive(entry));
    } catch {
      // A failing log sink never changes the result.
    }
    return result;
  }

  function fallback(manualLabel: string, reason: FallbackReason): LocationLookupResult {
    const label = manualLabel.trim();
    return label.length === 0
      ? { kind: 'manual_required', fallbackReason: reason }
      : { kind: 'resolved', location: { source: 'manual', label }, origin: 'manual', fallbackReason: reason };
  }

  return {
    providerName: provider.name,

    async lookup(query, manualLabel) {
      const startedAt = clock.now();
      if (normalizeQuery(query).length === 0) {
        return record(fallback(manualLabel, 'empty_query'), startedAt);
      }
      const cached = cache.get(query);
      if (cached !== null) {
        return record({ kind: 'resolved', location: cached, origin: 'cache', fallbackReason: null }, startedAt);
      }
      let answer;
      try {
        answer = await provider.geocode(query.trim());
      } catch {
        answer = { kind: 'unavailable', reason: 'network' } as const;
      }
      if (answer.kind === 'unavailable') {
        return record(fallback(manualLabel, answer.reason), startedAt);
      }
      const selected = selectIncidentLocation(answer.candidate, manualLabel);
      if (selected.source === 'provider') {
        cache.set(query, selected);
        return record({ kind: 'resolved', location: selected, origin: 'provider', fallbackReason: null }, startedAt);
      }
      return record(fallback(manualLabel, 'invalid_data'), startedAt);
    },
  };
}
