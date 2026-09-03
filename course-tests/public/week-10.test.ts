import { redactForTelemetry, reduceRemoteResponses } from '../../src/course-evaluation';

test('a late obsolete response cannot overwrite the active intent', () => {
  expect(
    reduceRemoteResponses({
      activeRequestId: 'B',
      responses: [
        { requestId: 'B', value: { id: 'B' } },
        { requestId: 'A', value: { id: 'A' } },
      ],
    }),
  ).toEqual({ state: 'success', value: { id: 'B' } });
});

test('observable error context is sanitized', () => {
  expect(redactForTelemetry({ error: 'timeout', accessToken: 'course-token', attempt: 2 })).toEqual({
    error: 'timeout',
    accessToken: '[REDACTED]',
    attempt: 2,
  });
});
