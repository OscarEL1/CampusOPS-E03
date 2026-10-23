import { localFieldsAfter, localViewOf, type PendingOperation } from '../src/campusops/domain/offlineQueue';
import { canonicalJson, deduplicateOperations, resolveSync, syncFieldsOf } from '../src/campusops/domain/syncMerge';
import { deduplicateOperations as evaluatedDeduplicate, resolveSync as evaluatedResolve } from '../src/course-evaluation';

/**
 * Week 08: the reconciliation rules as pure functions. Records are fictional
 * fixtures of the public contract.
 */

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) {
      deepFreeze(item);
    }
    Object.freeze(value);
  }
  return value;
}

const work = (assignedTechnicianId: string | null, status: string) => ({ assignedTechnicianId, status });

describe('resolveSync', () => {
  test('offline start against a remote reassignment is a conflict on work', () => {
    const base = deepFreeze({ id: 'campus-inc-001', version: 1, fields: { work: work('technician-1', 'assigned') } });
    const local = deepFreeze({ ...base, fields: { work: work('technician-1', 'in_progress') } });
    const remote = deepFreeze({ ...base, version: 2, fields: { work: work('technician-2', 'assigned') } });
    expect(resolveSync(base, local, remote)).toEqual({ kind: 'conflict', fields: ['work'] });
  });

  test('independent changes are combined', () => {
    const base = { id: 'r1', version: 1, fields: { title: 'A', priority: 1 } };
    expect(
      resolveSync(base, { ...base, fields: { title: 'Local', priority: 1 } }, { ...base, version: 2, fields: { title: 'A', priority: 2 } }),
    ).toEqual({ kind: 'merged', fields: { title: 'Local', priority: 2 } });
  });

  test('every incompatible field is reported, in name order', () => {
    const base = { id: 'r1', version: 1, fields: { zone: 'A', work: work('technician-1', 'assigned'), priority: 'low' } };
    const local = { ...base, fields: { zone: 'B', work: work('technician-1', 'in_progress'), priority: 'low' } };
    const remote = { ...base, version: 2, fields: { zone: 'C', work: work('technician-2', 'assigned'), priority: 'high' } };
    expect(resolveSync(base, local, remote)).toEqual({ kind: 'conflict', fields: ['work', 'zone'] });
  });

  test('both sides making the same change is not a conflict', () => {
    const base = { id: 'r1', version: 1, fields: { work: work('technician-1', 'assigned') } };
    const same = { work: work('technician-1', 'in_progress') };
    expect(resolveSync(base, { ...base, fields: same }, { ...base, version: 2, fields: same })).toEqual({ kind: 'merged', fields: same });
  });

  test('content is compared as JSON: key order and object identity do not matter', () => {
    const base = { id: 'r1', version: 1, fields: { work: { status: 'assigned', assignedTechnicianId: 'technician-1' } } };
    const local = { ...base, fields: { work: { status: 'in_progress', assignedTechnicianId: 'technician-1' } } };
    const remote = { ...base, version: 2, fields: { work: { assignedTechnicianId: 'technician-1', status: 'assigned' } } };
    expect(resolveSync(base, local, remote)).toEqual({ kind: 'merged', fields: { work: local.fields.work } });
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
  });

  test('a field added on one side and removed on none is kept', () => {
    const base = { id: 'r1', version: 1, fields: { work: work('technician-1', 'assigned') } };
    const local = { ...base, fields: { ...base.fields, 'note:op-1': 'Nota ficticia' } };
    expect(resolveSync(base, local, { ...base, version: 2 })).toEqual({ kind: 'merged', fields: local.fields });
  });

  test('inputs are not mutated and the result does not alias them', () => {
    const base = deepFreeze({ id: 'r1', version: 1, fields: { work: work('technician-1', 'assigned'), priority: 1 } });
    const local = deepFreeze({ ...base, fields: { work: work('technician-1', 'in_progress'), priority: 1 } });
    const remote = deepFreeze({ ...base, version: 2, fields: { work: work('technician-1', 'assigned'), priority: 2 } });
    const before = JSON.stringify([base, local, remote]);
    const result = resolveSync(base, local, remote);
    expect(JSON.stringify([base, local, remote])).toBe(before);
    expect(result.kind).toBe('merged');
    if (result.kind === 'merged') {
      expect(result.fields.work).toEqual(local.fields.work);
      expect(result.fields.work).not.toBe(local.fields.work);
    }
  });
});

describe('deduplicateOperations', () => {
  test('keeps the first operation of each operationId, in order, without mutating the list', () => {
    const operations = deepFreeze([
      { operationId: 'op-1', value: 'first' },
      { operationId: 'op-2', value: 'other' },
      { operationId: 'op-1', value: 'replayed with other content' },
    ]);
    const result = deduplicateOperations(operations);
    expect(result).toEqual([operations[0], operations[1]]);
    expect(result[0]).toBe(operations[0]);
    expect(result).not.toBe(operations);
    expect(operations).toHaveLength(3);
  });

  test('an empty queue stays empty', () => {
    expect(deduplicateOperations([])).toEqual([]);
  });
});

describe('CampusOps fields and local intentions', () => {
  const base = syncFieldsOf({ assignedTechnicianId: 'technician-1', status: 'assigned' });

  test('work groups assignment and status', () => {
    expect(base).toEqual({ work: { assignedTechnicianId: 'technician-1', status: 'assigned' } });
  });

  test('each queued action changes only its own fields', () => {
    expect(localFieldsAfter(base, { operationId: 'op-start-01', content: { action: 'start' } })).toEqual({
      work: { assignedTechnicianId: 'technician-1', status: 'in_progress' },
    });
    expect(localFieldsAfter(base, { operationId: 'op-note-0001', content: { action: 'comment', text: 'Nota ficticia' } })).toEqual({
      ...base,
      'note:op-note-0001': 'Nota ficticia',
    });
    expect(localFieldsAfter(base, { operationId: 'op-photo-001', content: { action: 'add_evidence', evidenceId: 'photo-ref-1' } })).toEqual({
      ...base,
      'evidence:photo-ref-1': 'pending_upload',
    });
  });

  test('the local view shows a pending start as in progress, but not a conflicting one', () => {
    const snapshot = {
      incident: {
        id: 'campus-inc-001',
        title: 'Incidencia de conectividad',
        category: 'connectivity' as const,
        description: 'Sin conexión en laboratorio ficticio',
        location: 'Edificio de prueba A',
        status: 'assigned' as const,
        reporterId: 'reporter-1',
        assignedTechnicianId: 'technician-1',
      },
      version: 2,
      cachedAt: 0,
    };
    const start: PendingOperation = {
      operationId: 'op-start-01',
      incidentId: 'campus-inc-001',
      actorId: 'technician-1',
      content: { action: 'start' },
      baseVersion: 2,
      baseFields: base,
      createdAt: 0,
      attempts: 0,
      state: 'pending',
      problem: null,
    };
    expect(localViewOf(snapshot, [start]).localStatus).toBe('in_progress');
    const conflicting = { ...start, state: 'conflict' as const };
    expect(localViewOf(snapshot, [conflicting])).toMatchObject({ localStatus: 'assigned', hasConflict: true });
  });
});

test('the evaluated adapters are the same rules', () => {
  const base = { id: 'r1', version: 1, fields: { title: 'A', priority: 1 } };
  const local = { ...base, fields: { title: 'Local', priority: 1 } };
  const remote = { ...base, version: 2, fields: { title: 'Remote', priority: 2 } };
  expect(evaluatedResolve(base, local, remote)).toEqual(resolveSync(base, local, remote));
  const operations = [{ operationId: 'a' }, { operationId: 'a' }];
  expect(evaluatedDeduplicate(operations)).toEqual(deduplicateOperations(operations));
});
