import { parseRemoteResource } from '../../src/course-evaluation';

test.each([
  [{ id: 'campus-inc-001', version: 2, status: 'assigned', payload: { category: 'connectivity', description: 'Falla ficticia' } }, true],
  [{ id: 'r-2', version: 3, status: 'closed', payload: null, ignored: 'forward-compatible' }, true],
  [{ id: '', version: 1, status: 'open', payload: null }, false],
  [{ id: 'r-3', version: '3', status: 'open', payload: null }, false],
  [null, false],
])('CampusOps validates the published incident DTO boundary %#', (input, expected) => {
  expect(parseRemoteResource(input).ok).toBe(expected);
});
