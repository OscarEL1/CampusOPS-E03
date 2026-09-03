import { coordinateRefresh } from '../../src/course-evaluation';

test('coalesces concurrent 401s into one refresh and retries each request once', () => {
  const summary = coordinateRefresh([
    { type: 'request401', requestId: 'a', generation: 0 },
    { type: 'request401', requestId: 'b', generation: 0 },
    { type: 'request401', requestId: 'c', generation: 0 },
    { type: 'refreshSucceeded', generation: 1, token: 'course-token-1' },
  ]);
  expect(summary).toEqual({
    status: 'authenticated',
    activeGeneration: 1,
    refreshCalls: 1,
    retriedRequestIds: ['a', 'b', 'c'],
    persistedToken: 'course-token-1',
  });
});

test('logout removes persisted session state', () => {
  expect(coordinateRefresh([{ type: 'logout' }]).persistedToken).toBeNull();
});
