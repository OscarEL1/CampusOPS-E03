import type {
  AuthEvent,
  JsonObject,
  ParseResult,
  PermissionEvent,
  RemoteResponse,
  SyncRecord,
} from './contracts';
import type { IncidentLocation } from '../campusops/contracts';
import { redactSensitive } from '../campusops/domain/logRedaction';
import { initialRefreshState, reduceSessionEvent } from '../campusops/domain/sessionRefresh';
import { parseRemoteResource as parseRemoteEnvelope } from '../campusops/infrastructure/remote/remoteResource';

function pending(name: string): never {
  throw new Error(`${name} must be implemented in the assigned week`);
}

/**
 * Week 04 adapter. It delegates to the CampusOps domain rule so the evaluated
 * behaviour and the behaviour the app relies on are the same code path.
 */
export function redactForTelemetry(input: unknown): unknown {
  return redactSensitive(input);
}

/**
 * Week 05 adapter. It delegates to the envelope validation the HTTP client
 * uses, so the evaluated contract and the one the app enforces are one rule.
 */
export function parseRemoteResource(input: unknown): ParseResult {
  return parseRemoteEnvelope(input);
}

/**
 * Week 06 adapter. It replays the events through the refresh policy the
 * session manager uses, so the evaluated behaviour and the app's are one rule.
 * A missing generation means the generation active at that moment.
 */
export function coordinateRefresh(events: readonly AuthEvent[]): Readonly<{
  status: 'anonymous' | 'authenticated';
  activeGeneration: number | null;
  refreshCalls: number;
  retriedRequestIds: readonly string[];
  persistedToken: string | null;
}> {
  const state = events.reduce((current, event) => {
    const active = current.activeGeneration ?? 0;
    switch (event.type) {
      case 'request401':
        return reduceSessionEvent(current, {
          type: 'request401',
          requestId: event.requestId ?? '',
          generation: event.generation ?? active,
        });
      case 'refreshSucceeded':
        if (typeof event.token !== 'string' || event.token.length === 0) {
          return current;
        }
        return reduceSessionEvent(current, {
          type: 'refreshSucceeded',
          generation: event.generation ?? active + 1,
          token: event.token,
        });
      case 'refreshFailed':
        return reduceSessionEvent(current, { type: 'refreshFailed' });
      case 'logout':
        return reduceSessionEvent(current, { type: 'logout' });
      default:
        return current;
    }
  }, initialRefreshState());
  return {
    status: state.status,
    activeGeneration: state.activeGeneration,
    refreshCalls: state.refreshCalls,
    retriedRequestIds: state.retried,
    persistedToken: state.token,
  };
}

export function resolveSync(
  _base: SyncRecord,
  _local: SyncRecord,
  _remote: SyncRecord,
): Readonly<{ kind: 'merged'; fields: JsonObject } | { kind: 'conflict'; fields: readonly string[] }> {
  return pending('resolveSync');
}

export function deduplicateOperations<T extends Readonly<{ operationId: string }>>(
  _operations: readonly T[],
): readonly T[] {
  return pending('deduplicateOperations');
}

export function planRetry(_input: Readonly<{
  method: 'GET' | 'POST';
  status: number | 'timeout';
  attempt: number;
  retryAfterMs?: number;
  idempotencyKey?: string;
}>): Readonly<{ retry: boolean; delayMs: number; requiresStableIdempotencyKey: boolean }> {
  return pending('planRetry');
}

export function reduceRemoteResponses(_input: Readonly<{
  activeRequestId: string;
  responses: readonly RemoteResponse[];
}>): Readonly<{ state: 'success' | 'error' | 'loading'; value?: unknown; error?: string }> {
  return pending('reduceRemoteResponses');
}

export function reducePermissionLifecycle(
  _events: readonly PermissionEvent[],
): Readonly<{ status: 'available' | 'denied' | 'blocked'; resourceActive: boolean }> {
  return pending('reducePermissionLifecycle');
}

/** Week 09: see docs/CAMPUSOPS_API.md; this is not a completed solution. */
export function selectIncidentLocation(_provider: unknown, _manualLabel: string): IncidentLocation {
  return pending('selectIncidentLocation');
}
