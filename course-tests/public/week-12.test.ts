import { reducePermissionLifecycle } from '../../src/course-evaluation';

test('revocation on resume invalidates the native resource', () => {
  expect(reducePermissionLifecycle(['granted', 'paused', 'revoked', 'resumed'])).toEqual({
    status: 'denied',
    resourceActive: false,
  });
});

test('permanent denial degrades without a retry loop', () => {
  expect(reducePermissionLifecycle(['denied_permanently'])).toEqual({ status: 'blocked', resourceActive: false });
});
