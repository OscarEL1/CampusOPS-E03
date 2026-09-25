import { logIncidentEvent, type IncidentLogEntry } from '../src/campusops/application/incidentLogging';
import type { CampusActor } from '../src/campusops/domain/accessPolicy';
import type { Incident } from '../src/campusops/domain/incident';
import { REDACTED, isSensitiveKey, redactSensitive } from '../src/campusops/domain/logRedaction';
import { readBackendApiSecret } from '../src/config/backendConfig';
import { redactForTelemetry } from '../src/course-evaluation';

/**
 * Week 04 negative tests.
 *
 * Every group states the threat from docs/threat-model.md that it defends, and
 * checks what must NOT appear rather than only what must. All data is fictional.
 */

const TECHNICIAN: CampusActor = { id: 'campus-tech-301', role: 'technician' };

const INCIDENT: Incident = {
  id: 'campus-inc-002',
  title: 'Conectividad intermitente en biblioteca',
  category: 'connectivity',
  description: 'La conexión inalámbrica se interrumpe durante periodos breves.',
  location: 'Biblioteca, segundo piso',
  status: 'assigned',
  reporterId: 'campus-reporter-202',
  assignedTechnicianId: TECHNICIAN.id,
};

/** Fictional markers that must never survive sanitisation. */
const MARKERS = {
  token: 'Bearer ficticio-token-a1b2c3',
  email: 'persona@campusops.test',
  displayName: 'Persona Ficticia',
  latitude: 19.0414,
  longitude: -98.2063,
  photo: 'foto-sintetica-1.jpg',
  comment: 'Nota interna ficticia',
} as const;

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((nested) => deepFreeze(nested));
    Object.freeze(value);
  }
  return value;
}

describe('T-03 filtrar datos en registros — sanitización de telemetría', () => {
  test('redacts sensitive keys nested several levels deep', () => {
    const payload = deepFreeze({
      correlationId: 'corr-0001',
      request: {
        attempt: 2,
        durationMs: 143,
        headers: { authorization: MARKERS.token, accept: 'application/json' },
        session: { refreshToken: 'ficticio-refresh', profile: { email: MARKERS.email } },
      },
    });

    const result = redactSensitive(payload);

    expect(result).toEqual({
      correlationId: 'corr-0001',
      request: {
        attempt: 2,
        durationMs: 143,
        headers: { authorization: REDACTED, accept: 'application/json' },
        session: { refreshToken: REDACTED, profile: { email: REDACTED } },
      },
    });
    expect(JSON.stringify(result)).not.toContain(MARKERS.token);
    expect(JSON.stringify(result)).not.toContain(MARKERS.email);
  });

  test('redacts every element of a list of records', () => {
    const payload = deepFreeze({
      incidentId: 'campus-inc-001',
      assignments: [
        { technicianId: 'campus-tech-301', status: 'assigned', durationMs: 10 },
        { technicianId: 'campus-tech-302', status: 'closed', durationMs: 20 },
      ],
    });

    expect(redactSensitive(payload)).toEqual({
      incidentId: 'campus-inc-001',
      assignments: [
        { technicianId: REDACTED, status: 'assigned', durationMs: 10 },
        { technicianId: REDACTED, status: 'closed', durationMs: 20 },
      ],
    });
  });

  test('replaces the whole value when a sensitive key holds a list or an object', () => {
    const payload = deepFreeze({
      incidentId: 'campus-inc-003',
      photos: [MARKERS.photo, 'foto-sintetica-2.jpg'],
      internalComments: [{ author: 'coordinacion', body: MARKERS.comment }],
      location: { latitude: MARKERS.latitude, longitude: MARKERS.longitude },
    });

    const result = redactSensitive(payload);

    expect(result).toEqual({
      incidentId: 'campus-inc-003',
      photos: REDACTED,
      internalComments: REDACTED,
      location: REDACTED,
    });
    const serialised = JSON.stringify(result);
    for (const marker of [MARKERS.photo, MARKERS.comment, String(MARKERS.latitude), String(MARKERS.longitude)]) {
      expect(serialised).not.toContain(marker);
    }
  });

  test('matches a sensitive key regardless of case, underscores or hyphens', () => {
    for (const key of ['access_token', 'ACCESS-TOKEN', 'accessToken', 'Display_Name', 'internal-comments']) {
      expect(isSensitiveKey(key)).toBe(true);
    }
    expect(redactSensitive({ access_token: 'x', 'ACCESS-TOKEN': 'y', accessToken: 'z' })).toEqual({
      access_token: REDACTED,
      'ACCESS-TOKEN': REDACTED,
      accessToken: REDACTED,
    });
  });

  test('keeps technical context an operator needs to diagnose a failure', () => {
    const payload = deepFreeze({
      incidentId: 'campus-inc-004',
      correlationId: 'corr-0002',
      status: 'server_error',
      attempt: 3,
      durationMs: 5120,
    });
    expect(redactSensitive(payload)).toEqual(payload);
    for (const key of ['incidentId', 'correlationId', 'status', 'attempt', 'durationMs']) {
      expect(isSensitiveKey(key)).toBe(false);
    }
  });

  test('does not modify the input', () => {
    const payload = deepFreeze({
      profile: { email: MARKERS.email, displayName: MARKERS.displayName },
      photos: [MARKERS.photo],
    });
    const before = JSON.stringify(payload);

    const result = redactSensitive(payload);

    expect(JSON.stringify(payload)).toBe(before);
    expect(result).not.toBe(payload);
    expect(payload.profile.email).toBe(MARKERS.email);
  });

  test('a __proto__ key becomes an ordinary property and does not reach the prototype', () => {
    const payload = JSON.parse('{"__proto__": {"polluted": true}, "incidentId": "campus-inc-005"}') as unknown;

    const result = redactSensitive(payload) as Record<string, unknown>;

    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(true);
  });

  test('passes through values that are not plain records', () => {
    const date = new Date('2026-09-25T00:00:00.000Z');
    expect(redactSensitive('texto')).toBe('texto');
    expect(redactSensitive(42)).toBe(42);
    expect(redactSensitive(null)).toBeNull();
    expect(redactSensitive(undefined)).toBeUndefined();
    expect(redactSensitive(date)).toBe(date);
  });

  test('the evaluated adapter and the domain rule are the same behaviour', () => {
    const payload = deepFreeze({ profile: { email: MARKERS.email }, incidentId: 'campus-inc-006' });
    expect(redactForTelemetry(payload)).toEqual(redactSensitive(payload));
  });
});

describe('T-03 filtrar datos en registros — caminos de error', () => {
  test('an error report built from a failed request carries no session or personal data', () => {
    const failure = deepFreeze({
      correlationId: 'corr-0003',
      status: 'rate_limited',
      attempt: 4,
      durationMs: 812,
      request: { headers: { authorization: MARKERS.token } },
      actor: { userId: 'campus-reporter-202', email: MARKERS.email, displayName: MARKERS.displayName },
      incidentId: 'campus-inc-007',
      location: 'Biblioteca, segundo piso',
    });

    const serialised = JSON.stringify(redactSensitive(failure));

    for (const marker of [MARKERS.token, MARKERS.email, MARKERS.displayName, 'campus-reporter-202', 'Biblioteca']) {
      expect(serialised).not.toContain(marker);
    }
    expect(serialised).toContain('corr-0003');
    expect(serialised).toContain('rate_limited');
    expect(serialised).toContain('campus-inc-007');
  });

  test('the missing-secret error names the variable but never a value', () => {
    expect(() => readBackendApiSecret(undefined)).toThrow(/Missing backend API secret/);
    try {
      readBackendApiSecret('   ');
      throw new Error('se esperaba un error');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain('   ');
      expect(message).not.toMatch(/Bearer|token|=/i);
    }
  });
});

describe('T-03 filtrar datos en registros — lo que llega al sumidero de logs', () => {
  test('an incident log entry survives the telemetry rule unchanged', () => {
    const entries: IncidentLogEntry[] = [];
    logIncidentEvent((entry) => entries.push(entry), 'incident.viewed', TECHNICIAN, INCIDENT);

    // The two controls agree: nothing the week 03 allowlist emits is sensitive
    // under the week 04 contract.
    expect(redactSensitive(entries[0])).toEqual(entries[0]);
  });

  test('the telemetry rule alone is not enough for a raw incident, which is why the allowlist exists', () => {
    const throughContract = redactSensitive(INCIDENT) as Record<string, unknown>;

    // The published contract redacts identifiers and location by key name.
    expect(throughContract.location).toBe(REDACTED);
    expect(throughContract.reporterId).toBe(REDACTED);
    expect(throughContract.assignedTechnicianId).toBe(REDACTED);

    // It does not cover free text, because `title` and `description` are not in
    // the key set. This is the residual risk recorded in docs/security-controls.md
    // and the reason logIncidentEvent builds its record from an allowlist.
    expect(throughContract.description).toBe(INCIDENT.description);

    const entries: IncidentLogEntry[] = [];
    logIncidentEvent((entry) => entries.push(entry), 'incident.viewed', TECHNICIAN, INCIDENT);
    const emitted = JSON.stringify(entries[0]);
    expect(emitted).not.toContain(INCIDENT.description);
    expect(emitted).not.toContain(INCIDENT.title);
    expect(emitted).not.toContain(INCIDENT.location);
  });
});
