import {
  MAX_RETRIES_PER_REQUEST,
  initialRefreshState,
  replaySessionEvents,
  type SessionEvent,
} from '../src/campusops/domain/sessionRefresh';
import { coordinateRefresh } from '../src/course-evaluation';

/**
 * Week 06: the refresh policy as a pure reducer. Every case replays events, so
 * the order of a race is exact and nothing depends on timing. Tokens are
 * fictional fixtures.
 */

const expired = (requestId: string, generation = 1): SessionEvent => ({ type: 'request401', requestId, generation });
const loggedIn = initialRefreshState({ generation: 1, token: 'course-token-gen-1' });

describe('single-flight refresh', () => {
  test('three coinciding 401s start one refresh and retry each request once', () => {
    const state = replaySessionEvents(
      [expired('a'), expired('b'), expired('c'), { type: 'refreshSucceeded', generation: 2, token: 'course-token-gen-2' }],
      loggedIn,
    );
    expect(state.refreshCalls).toBe(1);
    expect(state.retried).toEqual(['a', 'b', 'c']);
    expect(state.failed).toEqual([]);
    expect(state.activeGeneration).toBe(2);
    expect(state.token).toBe('course-token-gen-2');
  });

  test('a 401 that arrives while the refresh is in flight joins it', () => {
    const during = replaySessionEvents([expired('a'), expired('b')], loggedIn);
    expect(during.refreshInFlight).toBe(true);
    expect(during.waiting).toEqual(['a', 'b']);
    expect(during.refreshCalls).toBe(1);
  });

  test('the same request reporting 401 twice while waiting is counted once', () => {
    const state = replaySessionEvents([expired('a'), expired('a')], loggedIn);
    expect(state.waiting).toEqual(['a']);
  });

  test('a stale 401 from an older generation is retried without a new refresh', () => {
    const state = replaySessionEvents(
      [expired('a'), { type: 'refreshSucceeded', generation: 2, token: 'course-token-gen-2' }, expired('late', 1)],
      loggedIn,
    );
    expect(state.refreshCalls).toBe(1);
    expect(state.retried).toEqual(['a', 'late']);
  });

  test('a 401 of the new generation after a refresh starts exactly one more refresh', () => {
    const state = replaySessionEvents(
      [expired('a'), { type: 'refreshSucceeded', generation: 2, token: 'course-token-gen-2' }, expired('b', 2), expired('c', 2)],
      loggedIn,
    );
    expect(state.refreshCalls).toBe(2);
    expect(state.waiting).toEqual(['b', 'c']);
  });
});

describe('bounded retries', () => {
  test(`a request is retried at most ${String(MAX_RETRIES_PER_REQUEST)} time and then fails without refreshing`, () => {
    const state = replaySessionEvents(
      [expired('a'), { type: 'refreshSucceeded', generation: 2, token: 'course-token-gen-2' }, expired('a', 2)],
      loggedIn,
    );
    expect(state.retried).toEqual(['a']);
    expect(state.failed).toEqual(['a']);
    expect(state.refreshCalls).toBe(1);
    expect(state.refreshInFlight).toBe(false);
  });

  test('a server that answers 401 forever produces one refresh per generation, never a loop', () => {
    const events: SessionEvent[] = [];
    for (let round = 0; round < 50; round += 1) {
      events.push(expired('a', 1));
    }
    events.push({ type: 'refreshSucceeded', generation: 2, token: 'course-token-gen-2' });
    for (let round = 0; round < 50; round += 1) {
      events.push(expired('a', 2));
    }
    const state = replaySessionEvents(events, loggedIn);
    expect(state.refreshCalls).toBe(1);
    expect(state.retried).toEqual(['a']);
    expect(state.refreshInFlight).toBe(false);
  });
});

describe('failed, obsolete and unavailable refresh', () => {
  test('a refused refresh ends the session and fails every waiting request', () => {
    const state = replaySessionEvents([expired('a'), expired('b'), expired('c'), { type: 'refreshFailed' }], loggedIn);
    expect(state.status).toBe('anonymous');
    expect(state.token).toBeNull();
    expect(state.activeGeneration).toBeNull();
    expect(state.retried).toEqual([]);
    expect(state.failed).toEqual(['a', 'b', 'c']);
  });

  test('after a refused refresh a new 401 does not refresh again', () => {
    const state = replaySessionEvents([expired('a'), { type: 'refreshFailed' }, expired('b')], loggedIn);
    expect(state.refreshCalls).toBe(1);
    expect(state.failed).toEqual(['a', 'b']);
  });

  test('a refresh result with no refresh in flight is obsolete and ignored', () => {
    const state = replaySessionEvents([{ type: 'refreshSucceeded', generation: 9, token: 'course-token-gen-9' }], loggedIn);
    expect(state).toEqual(loggedIn);
  });

  test('a refresh result that is not newer than the active generation is ignored', () => {
    const state = replaySessionEvents([expired('a'), { type: 'refreshSucceeded', generation: 1, token: 'course-token-old' }], loggedIn);
    expect(state.token).toBe('course-token-gen-1');
    expect(state.refreshInFlight).toBe(true);
    expect(state.retried).toEqual([]);
  });

  test('a refresh that finishes after logout cannot bring the session back', () => {
    const state = replaySessionEvents(
      [expired('a'), { type: 'logout' }, { type: 'refreshSucceeded', generation: 2, token: 'course-token-gen-2' }],
      loggedIn,
    );
    expect(state.status).toBe('anonymous');
    expect(state.token).toBeNull();
    expect(state.failed).toEqual(['a']);
  });

  test('an unavailable refresh keeps the session, fails the waiting requests and allows one later attempt', () => {
    const state = replaySessionEvents(
      [expired('a'), expired('b'), { type: 'refreshUnavailable' }, expired('c')],
      loggedIn,
    );
    expect(state.status).toBe('authenticated');
    expect(state.token).toBe('course-token-gen-1');
    expect(state.failed).toEqual(['a', 'b']);
    expect(state.refreshCalls).toBe(2);
    expect(state.waiting).toEqual(['c']);
  });

  test('a 401 with no session never starts a refresh', () => {
    const state = replaySessionEvents([expired('a', 0)], initialRefreshState(null));
    expect(state.refreshCalls).toBe(0);
    expect(state.failed).toEqual(['a']);
  });
});

describe('evaluated adapter uses the same policy', () => {
  test('matches the published example', () => {
    expect(
      coordinateRefresh([
        { type: 'request401', requestId: 'a', generation: 0 },
        { type: 'request401', requestId: 'b', generation: 0 },
        { type: 'request401', requestId: 'c', generation: 0 },
        { type: 'refreshSucceeded', generation: 1, token: 'course-token-1' },
      ]),
    ).toEqual({
      status: 'authenticated',
      activeGeneration: 1,
      refreshCalls: 1,
      retriedRequestIds: ['a', 'b', 'c'],
      persistedToken: 'course-token-1',
    });
  });

  test('a failed refresh returns to anonymous with no persisted token and no retries', () => {
    expect(
      coordinateRefresh([
        { type: 'request401', requestId: 'a', generation: 0 },
        { type: 'request401', requestId: 'b', generation: 0 },
        { type: 'refreshFailed' },
      ]),
    ).toEqual({ status: 'anonymous', activeGeneration: null, refreshCalls: 1, retriedRequestIds: [], persistedToken: null });
  });

  test('logout removes the persisted token even after a successful refresh', () => {
    const summary = coordinateRefresh([
      { type: 'request401', requestId: 'a', generation: 0 },
      { type: 'refreshSucceeded', generation: 1, token: 'course-token-1' },
      { type: 'logout' },
    ]);
    expect(summary.status).toBe('anonymous');
    expect(summary.persistedToken).toBeNull();
  });

  test('a refresh event without a token is ignored instead of persisting an empty token', () => {
    const summary = coordinateRefresh([{ type: 'request401', requestId: 'a', generation: 0 }, { type: 'refreshSucceeded', generation: 1 }]);
    expect(summary.persistedToken).toBeNull();
    expect(summary.retriedRequestIds).toEqual([]);
  });
});
