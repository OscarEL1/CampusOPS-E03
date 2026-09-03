import { deduplicateOperations, resolveSync } from '../../src/course-evaluation';

test('CampusOps detects offline start versus remote reassignment without mutating either record', () => {
  const base = { id: 'campus-inc-001', version: 1, fields: { work: { assignedTechnicianId: 'technician-1', status: 'assigned' } } };
  const local = { ...base, fields: { work: { assignedTechnicianId: 'technician-1', status: 'in_progress' } } };
  const remote = { ...base, version: 2, fields: { work: { assignedTechnicianId: 'technician-2', status: 'assigned' } } };
  const before = JSON.stringify([base, local, remote]);
  expect(resolveSync(base, local, remote)).toEqual({ kind: 'conflict', fields: ['work'] });
  expect(JSON.stringify([base, local, remote])).toBe(before);
});

test('merges independent field changes and reports same-field conflict', () => {
  const base = { id: 'r1', version: 1, fields: { title: 'A', priority: 1 } };
  expect(
    resolveSync(
      base,
      { id: 'r1', version: 1, fields: { title: 'Local', priority: 1 } },
      { id: 'r1', version: 2, fields: { title: 'A', priority: 2 } },
    ),
  ).toEqual({ kind: 'merged', fields: { title: 'Local', priority: 2 } });
  expect(
    resolveSync(
      base,
      { id: 'r1', version: 1, fields: { title: 'Local', priority: 1 } },
      { id: 'r1', version: 2, fields: { title: 'Remote', priority: 1 } },
    ),
  ).toEqual({ kind: 'conflict', fields: ['title'] });
});

test('deduplicates a replayed operation by stable identity', () => {
  const operations = [{ operationId: 'op-1', value: 1 }, { operationId: 'op-1', value: 1 }, { operationId: 'op-2', value: 2 }];
  expect(deduplicateOperations(operations)).toEqual([operations[0], operations[2]]);
});
