import { parseRemoteResource as evaluatedAdapter } from '../src/course-evaluation';
import type { RemoteResource } from '../src/campusops/infrastructure/remote/remoteResource';
import { inspectRemoteResource, parseRemoteResource } from '../src/campusops/infrastructure/remote/remoteResource';
import { toRemoteIncident } from '../src/campusops/infrastructure/remote/incidentDto';

/**
 * Week 05 contract tests: the envelope boundary, the DTO-to-domain mapping and
 * the separation between what the server sends and what the app uses. All data
 * is fictional and mirrors the shapes of course-backend/campusops.mjs.
 */

const PAYLOAD = {
  category: 'connectivity',
  description: 'Sin conexión en laboratorio ficticio',
  location: 'Edificio de prueba A',
  reporterId: 'reporter-1',
  assignedTechnicianId: 'technician-1',
  priority: 'medium',
  notes: [{ actorId: 'coordinator-1', text: 'Nota interna ficticia' }],
  evidence: [{ actorId: 'technician-1', evidenceId: 'evidencia-sintetica-1' }],
  history: [{ operationId: 'op-ficticia-1', actorId: 'coordinator-1', action: 'assign', version: 2 }],
  diagnosis: 'Diagnóstico ficticio',
};

const ENVELOPE = { id: 'campus-inc-001', version: 2, status: 'assigned', payload: PAYLOAD };

function envelope(overrides: Record<string, unknown>): unknown {
  return { ...ENVELOPE, ...overrides };
}

function resource(overrides: Partial<RemoteResource> = {}): RemoteResource {
  return { id: 'campus-inc-001', version: 2, status: 'assigned', payload: PAYLOAD, ...overrides };
}

describe('envelope contract { id, version, status, payload }', () => {
  test('accepts a valid envelope and returns exactly the four contract fields', () => {
    expect(parseRemoteResource(ENVELOPE)).toEqual({
      ok: true,
      value: { id: 'campus-inc-001', version: 2, status: 'assigned', payload: PAYLOAD },
    });
  });

  test('accepts a null payload as a valid envelope, not as a violation', () => {
    expect(parseRemoteResource(envelope({ payload: null }))).toEqual({
      ok: true,
      value: { id: 'campus-inc-001', version: 2, status: 'assigned', payload: null },
    });
  });

  test('ignores a forward-compatible field and does not carry it into the app', () => {
    const result = parseRemoteResource(envelope({ etag: 'w/"7"', links: { self: '/v1/incidents/campus-inc-001' } }));
    expect(result.ok).toBe(true);
    expect(result.ok && Object.keys(result.value).sort()).toEqual(['id', 'payload', 'status', 'version']);
  });

  test.each([
    ['version 0 is the lowest valid version', { version: 0 }, true],
    ['a negative version', { version: -1 }, false],
    ['a fractional version', { version: 2.5 }, false],
    ['a version sent as text', { version: '3' }, false],
    ['a version that is NaN', { version: Number.NaN }, false],
    ['an infinite version', { version: Number.POSITIVE_INFINITY }, false],
    ['an empty id', { id: '' }, false],
    ['an id of only spaces', { id: '   ' }, false],
    ['a numeric id', { id: 7 }, false],
    ['a missing id', { id: undefined }, false],
    ['an empty status', { status: '' }, false],
    ['a missing status', { status: undefined }, false],
    ['an array payload', { payload: [PAYLOAD] }, false],
    ['a text payload', { payload: 'payload' }, false],
    ['a numeric payload', { payload: 1 }, false],
    ['a missing payload', { payload: undefined }, false],
  ])('%s', (_label, overrides, expected) => {
    expect(parseRemoteResource(envelope(overrides)).ok).toBe(expected);
  });

  test.each([
    ['null', null],
    ['undefined', undefined],
    ['an array', [ENVELOPE]],
    ['text', 'campus-inc-001'],
    ['a number', 42],
  ])('rejects %s instead of an envelope', (_label, input) => {
    expect(parseRemoteResource(input)).toEqual({ ok: false, error: 'contract' });
  });

  test('reports which rule failed, for diagnostics only', () => {
    expect(inspectRemoteResource(envelope({ version: '3' }))).toEqual({ ok: false, violation: 'version' });
    expect(inspectRemoteResource(envelope({ id: '' }))).toEqual({ ok: false, violation: 'id' });
    expect(inspectRemoteResource(envelope({ payload: [] }))).toEqual({ ok: false, violation: 'payload' });
    expect(inspectRemoteResource(null)).toEqual({ ok: false, violation: 'not_an_object' });
  });

  test('the published error carries no internal detail', () => {
    expect(parseRemoteResource(envelope({ version: '3' }))).toEqual({ ok: false, error: 'contract' });
  });

  test('does not modify the input', () => {
    const input = Object.freeze({ ...ENVELOPE, extra: 'x' });
    const before = JSON.stringify(input);
    parseRemoteResource(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  test('the evaluated adapter is the same rule the client enforces', () => {
    const cases: unknown[] = [
      ENVELOPE,
      envelope({ payload: null }),
      envelope({ version: '3' }),
      envelope({ id: '' }),
      envelope({ payload: [] }),
      null,
    ];
    for (const input of cases) {
      expect(evaluatedAdapter(input)).toEqual(parseRemoteResource(input));
    }
  });
});

describe('DTO to domain mapping', () => {
  test('maps a valid payload to a domain incident and keeps the version beside it', () => {
    expect(toRemoteIncident(resource())).toEqual({
      ok: true,
      value: {
        kind: 'available',
        version: 2,
        incident: {
          id: 'campus-inc-001',
          title: 'Incidencia de conectividad',
          category: 'connectivity',
          description: 'Sin conexión en laboratorio ficticio',
          location: 'Edificio de prueba A',
          status: 'assigned',
          reporterId: 'reporter-1',
          assignedTechnicianId: 'technician-1',
        },
      },
    });
  });

  test('a null payload becomes withheld with only id, version and status', () => {
    const mapped = toRemoteIncident(resource({ payload: null }));
    expect(mapped).toEqual({
      ok: true,
      value: { kind: 'withheld', summary: { id: 'campus-inc-001', version: 2, status: 'assigned' } },
    });
    // Nothing is invented for the fields the server did not send.
    expect(mapped.ok && mapped.value.kind === 'withheld' && Object.keys(mapped.value.summary).sort()).toEqual([
      'id',
      'status',
      'version',
    ]);
  });

  test('an unassigned incident keeps assignedTechnicianId as null', () => {
    const mapped = toRemoteIncident(resource({ payload: { ...PAYLOAD, assignedTechnicianId: null }, status: 'open' }));
    expect(mapped.ok && mapped.value.kind === 'available' && mapped.value.incident.assignedTechnicianId).toBeNull();
  });

  test.each([
    ['a status outside the domain', { status: 'archived' }, 'status_not_in_domain'],
    ['a status outside the domain even with a null payload', { status: 'archived', payload: null }, 'status_not_in_domain'],
    ['an unknown category', { payload: { ...PAYLOAD, category: 'plumbing' } }, 'category'],
    ['an empty description', { payload: { ...PAYLOAD, description: '  ' } }, 'description'],
    ['a missing location', { payload: { ...PAYLOAD, location: undefined } }, 'location'],
    ['a location sent as an object', { payload: { ...PAYLOAD, location: { label: 'A' } } }, 'location'],
    ['a missing reporter', { payload: { ...PAYLOAD, reporterId: undefined } }, 'reporterId'],
    ['a missing assignedTechnicianId, which is not the same as unassigned', { payload: { ...PAYLOAD, assignedTechnicianId: undefined } }, 'assignedTechnicianId'],
    ['an empty assignedTechnicianId', { payload: { ...PAYLOAD, assignedTechnicianId: '' } }, 'assignedTechnicianId'],
  ])('rejects %s', (_label, overrides, reason) => {
    expect(toRemoteIncident(resource(overrides as Partial<RemoteResource>))).toEqual({ ok: false, reason });
  });
});

describe('separation between remote data and app objects', () => {
  test('server-only fields never reach the domain incident', () => {
    const mapped = toRemoteIncident(resource());
    const incident = mapped.ok && mapped.value.kind === 'available' ? mapped.value.incident : null;
    expect(incident).not.toBeNull();
    expect(Object.keys(incident ?? {}).sort()).toEqual([
      'assignedTechnicianId',
      'category',
      'description',
      'id',
      'location',
      'reporterId',
      'status',
      'title',
    ]);
    const serialised = JSON.stringify(incident);
    for (const remoteOnly of ['Nota interna ficticia', 'evidencia-sintetica-1', 'op-ficticia-1', 'Diagnóstico ficticio', 'medium']) {
      expect(serialised).not.toContain(remoteOnly);
    }
  });

  test('the version belongs to the remote copy, not to the incident', () => {
    const mapped = toRemoteIncident(resource());
    expect(mapped.ok && mapped.value.kind === 'available' && 'version' in mapped.value.incident).toBe(false);
    expect(mapped.ok && mapped.value.kind === 'available' && mapped.value.version).toBe(2);
  });

  test('the incident is a new object: changing the DTO afterwards does not change it', () => {
    const payload = { ...PAYLOAD };
    const mapped = toRemoteIncident(resource({ payload }));
    payload.description = 'Texto cambiado después';
    expect(mapped.ok && mapped.value.kind === 'available' && mapped.value.incident.description).toBe(
      'Sin conexión en laboratorio ficticio',
    );
  });
});
