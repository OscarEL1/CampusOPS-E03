/**
 * Location of an incident (week 09). A geocoding provider is an external,
 * untrusted source: its answer is accepted only when it carries a non-empty
 * label and finite coordinates inside latitude [-90, 90] and longitude
 * [-180, 180]. Anything else (null, an error as data, missing or invalid
 * fields) keeps the label the person wrote. Coordinates are never invented.
 */

export type SelectedLocation =
  | Readonly<{ source: 'provider'; label: string; latitude: number; longitude: number }>
  | Readonly<{ source: 'manual'; label: string }>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCoordinate(value: unknown, limit: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -limit && value <= limit;
}

export function selectIncidentLocation(provider: unknown, manualLabel: string): SelectedLocation {
  if (isPlainObject(provider)) {
    const label = typeof provider.label === 'string' ? provider.label.trim() : '';
    const { latitude, longitude } = provider;
    if (label.length > 0 && isCoordinate(latitude, 90) && isCoordinate(longitude, 180)) {
      return { source: 'provider', label, latitude, longitude };
    }
  }
  return { source: 'manual', label: manualLabel.trim() };
}

/** Why the provider could not be used. */
export type GeocodingFailure =
  | 'timeout'
  | 'rate_limited'
  | 'network'
  | 'server_error'
  | 'unauthorized'
  | 'not_found'
  | 'rejected'
  | 'invalid_response';

export type GeocodingResult =
  | Readonly<{ kind: 'candidate'; candidate: unknown }>
  | Readonly<{ kind: 'unavailable'; reason: GeocodingFailure }>;

/** Domain port for a geocoding service. Never rejects; the candidate is still unvalidated. */
export interface GeocodingProvider {
  readonly name: string;
  geocode(query: string): Promise<GeocodingResult>;
}
