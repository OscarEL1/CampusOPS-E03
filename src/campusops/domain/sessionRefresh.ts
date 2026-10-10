/**
 * Refresh policy of a CampusOps session, as a pure reducer over events.
 *
 * Every access token belongs to a generation. A 401 carries the generation of
 * the token the request used, so the policy can tell a fresh expiry from a
 * stale one that a refresh already fixed. The session manager drives the real
 * refresh with this reducer, and the evaluated `coordinateRefresh` adapter
 * replays events through the same function.
 *
 * Rules:
 * - Coinciding 401s of the current generation share one refresh (single-flight).
 * - A 401 from an older generation is retried with the current token, without
 *   a new refresh.
 * - Each request is retried at most MAX_RETRIES_PER_REQUEST times; a request
 *   that still gets 401 fails instead of starting another refresh.
 * - A refresh result that does not answer the refresh in flight, or that is not
 *   newer than the active generation, is obsolete and ignored.
 * - A refused refresh (the grant is no longer valid) or a logout ends in the
 *   anonymous state with no token, and every request waiting for it fails.
 * - A refresh that got no usable answer (network, timeout, 5xx) proves nothing
 *   about the session: the waiting requests fail, the session stays, and the
 *   next 401 may try again. It is never retried automatically, so no loop.
 */

export const MAX_RETRIES_PER_REQUEST = 1;

export type SessionEvent =
  | Readonly<{ type: 'login'; generation: number; token: string }>
  | Readonly<{ type: 'request401'; requestId: string; generation: number }>
  | Readonly<{ type: 'refreshSucceeded'; generation: number; token: string }>
  | Readonly<{ type: 'refreshFailed' }>
  | Readonly<{ type: 'refreshUnavailable' }>
  | Readonly<{ type: 'logout' }>;

export type RefreshState = Readonly<{
  status: 'anonymous' | 'authenticated';
  activeGeneration: number | null;
  token: string | null;
  refreshInFlight: boolean;
  /** Requests waiting for the refresh in flight, in arrival order. */
  waiting: readonly string[];
  refreshCalls: number;
  /** Retries granted so far, in order. A request appears at most once. */
  retried: readonly string[];
  /** Requests that ended without a retry: no session, retry limit or failed refresh. */
  failed: readonly string[];
}>;

export function initialRefreshState(
  start: Readonly<{ generation: number; token: string | null }> | null = { generation: 0, token: null },
): RefreshState {
  return {
    status: start === null ? 'anonymous' : 'authenticated',
    activeGeneration: start === null ? null : start.generation,
    token: start === null ? null : start.token,
    refreshInFlight: false,
    waiting: [],
    refreshCalls: 0,
    retried: [],
    failed: [],
  };
}

function endSession(state: RefreshState): RefreshState {
  return {
    ...state,
    status: 'anonymous',
    activeGeneration: null,
    token: null,
    refreshInFlight: false,
    waiting: [],
    failed: [...state.failed, ...state.waiting],
  };
}

function onUnauthorized(state: RefreshState, requestId: string, generation: number): RefreshState {
  if (state.status === 'anonymous' || state.activeGeneration === null) {
    return { ...state, failed: [...state.failed, requestId] };
  }
  const retries = state.retried.filter((id) => id === requestId).length;
  if (retries >= MAX_RETRIES_PER_REQUEST) {
    // The retry already used a renewed token and still got 401: renewing again
    // would loop, so the request fails.
    return { ...state, failed: [...state.failed, requestId] };
  }
  if (state.waiting.includes(requestId)) {
    return state;
  }
  if (generation < state.activeGeneration) {
    return { ...state, retried: [...state.retried, requestId] };
  }
  if (state.refreshInFlight) {
    return { ...state, waiting: [...state.waiting, requestId] };
  }
  return { ...state, refreshInFlight: true, refreshCalls: state.refreshCalls + 1, waiting: [requestId] };
}

export function reduceSessionEvent(state: RefreshState, event: SessionEvent): RefreshState {
  switch (event.type) {
    case 'login':
      return { ...initialRefreshState({ generation: event.generation, token: event.token }), refreshCalls: state.refreshCalls };
    case 'request401':
      return onUnauthorized(state, event.requestId, event.generation);
    case 'refreshSucceeded':
      if (!state.refreshInFlight || state.activeGeneration === null || event.generation <= state.activeGeneration) {
        return state;
      }
      return {
        ...state,
        activeGeneration: event.generation,
        token: event.token,
        refreshInFlight: false,
        waiting: [],
        retried: [...state.retried, ...state.waiting],
      };
    case 'refreshFailed':
      return state.refreshInFlight ? endSession(state) : state;
    case 'refreshUnavailable':
      return state.refreshInFlight
        ? { ...state, refreshInFlight: false, waiting: [], failed: [...state.failed, ...state.waiting] }
        : state;
    case 'logout':
      return endSession(state);
    default: {
      const unreachable: never = event;
      return unreachable;
    }
  }
}

export function replaySessionEvents(events: readonly SessionEvent[], start?: RefreshState): RefreshState {
  return events.reduce(reduceSessionEvent, start ?? initialRefreshState());
}
