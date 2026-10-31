import { mkdirSync, writeFileSync } from 'node:fs';
import { request } from 'node:https';
import { dirname } from 'node:path';

import { createLocationCache, createLocationLookup } from '../../src/campusops/application/locationLookup';
import { createOpenMeteoGeocodingProvider } from '../../src/campusops/infrastructure/remote/geocodingProviders';
import type { FetchLike } from '../../src/campusops/infrastructure/remote/httpIncidentGateway';

/**
 * Week 09 real execution against Open-Meteo's public geocoding API, through
 * the same adapter and lookup the app uses. It needs Internet, so it is kept
 * out of the regular runs (course tests must not depend on external
 * availability) and is run on purpose with `npm run geocoding:live`.
 *
 * Queries: a public city name (no personal or institutional data) and a
 * fictional campus that does not exist, which must fall back to the manual
 * label. The observed run is written to reports/week-09/live-geocoding-run.json.
 */

const OUT = 'reports/week-09/live-geocoding-run.json';

const httpsFetch: FetchLike = (url, init) =>
  new Promise((resolve, reject) => {
    const outgoing = request(
      url,
      { method: init.method, headers: { ...init.headers, 'User-Agent': 'CampusOps-DMI-course/0.9 (academic exercise)' }, signal: init.signal },
      (incoming) => {
        const chunks: Buffer[] = [];
        incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
        incoming.on('error', reject);
        incoming.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({
            status: incoming.statusCode ?? 0,
            headers: {
              get: (name: string) => {
                const value = incoming.headers[name.toLowerCase()];
                return Array.isArray(value) ? value.join(', ') : (value ?? null);
              },
            },
            text: async () => text,
          });
        });
      },
    );
    outgoing.on('error', reject);
    outgoing.end();
  });

test('real Open-Meteo execution through the CampusOps adapter, with manual fallback for a fictional place', async () => {
  const entries: unknown[] = [];
  const clock = { now: () => Date.now() };
  const provider = createOpenMeteoGeocodingProvider({ fetchImpl: httpsFetch, retry: {}, log: (entry) => entries.push(entry) });
  const lookup = createLocationLookup({ provider, cache: createLocationCache({ clock }), clock, log: (entry) => entries.push(entry) });

  const city = await lookup.lookup('Puebla', 'Ciudad de prueba (manual)');
  const cached = await lookup.lookup('  puebla ', 'Ciudad de prueba (manual)');
  const fictional = await lookup.lookup('Campus Ficticio Zeta 9', 'Edificio Z, zona de prueba');

  expect(city).toMatchObject({ kind: 'resolved', origin: 'provider', location: { source: 'provider' } });
  expect(cached).toMatchObject({ kind: 'resolved', origin: 'cache' });
  expect(fictional).toEqual({
    kind: 'resolved',
    location: { source: 'manual', label: 'Edificio Z, zona de prueba' },
    origin: 'manual',
    fallbackReason: 'not_found',
  });

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(
    OUT,
    `${JSON.stringify(
      {
        provider: 'open-meteo',
        endpoint: 'https://geocoding-api.open-meteo.com/v1/search',
        executedAt: new Date().toISOString(),
        node: process.version,
        runs: [
          { query: 'Puebla', note: 'nombre público de ciudad', result: city },
          { query: '  puebla ', note: 'misma consulta normalizada', result: cached },
          { query: 'Campus Ficticio Zeta 9', note: 'lugar ficticio inexistente', result: fictional },
        ],
        sanitizedLog: entries,
      },
      null,
      2,
    )}\n`,
  );
}, 30000);
