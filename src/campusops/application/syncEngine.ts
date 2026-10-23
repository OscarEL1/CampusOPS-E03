import type { CampusActor } from '../domain/accessPolicy';
import type {
  ActedIncident,
  IncidentActionInput,
  IncidentGateway,
  RemoteFailure,
  RemoteIncident,
  RemoteResult,
} from '../domain/incidentGateway';
import {
  localFieldsAfter,
  type IncidentSnapshot,
  type OfflineStore,
  type OperationContent,
  type PendingOperation,
  type SyncProblem,
} from '../domain/offlineQueue';
import type { Clock } from '../domain/session';
import { canonicalJson, deduplicateOperations, resolveSync, syncFieldsOf, type SyncFields } from '../domain/syncMerge';

/**
 * Sends the persistent queue to the server (week 08).
 *
 * Policy:
 * - Only the signed-in actor's operations are sent, oldest first, each with its
 *   own operationId as Idempotency-Key and its stored content and base version.
 * - Confirmed (including a replay answered `duplicate: true`) -> removed from
 *   the queue together with the server copy, in one transaction.
 * - No usable answer (timeout, network, 5xx, 429, 401, malformed) -> kept as
 *   is and the run stops: a timeout does not prove the server did nothing.
 * - Stale version (409) -> the server copy is read and compared with
 *   resolveSync. Compatible changes are rebased onto the new version and sent
 *   once more; incompatible ones become a conflict.
 * - Forbidden (403) and the incident is no longer visible -> the assignment
 *   changed under us: conflict on `work`. The remote assignment is not touched.
 * - Conflicts and rejections stay in the queue for an explicit decision, and
 *   later changes to the same incident wait behind them.
 */

export type SyncReport = Readonly<{
  /** Removed from the queue after the server confirmed them. */
  confirmed: readonly string[];
  /** Confirmed by a `duplicate: true` answer: the server already had the effect. */
  replayed: readonly string[];
  /** Merged onto a newer server version before being sent again. */
  rebased: readonly string[];
  conflicts: readonly string[];
  rejected: readonly string[];
  /** Already waiting for a decision before this run (conflict or rejected). */
  held: readonly string[];
  /** Still pending: not attempted, blocked behind another change, or unconfirmed. */
  pending: readonly string[];
  stoppedBy: RemoteFailure['kind'] | null;
}>;

export type SyncEngine = Readonly<{ sync(): Promise<SyncReport> }>;

export type SyncEngineOptions = Readonly<{
  store: OfflineStore;
  gateway: Pick<IncidentGateway, 'act' | 'get'>;
  actor: CampusActor;
  clock?: Clock;
}>;

const UNCONFIRMED: ReadonlySet<RemoteFailure['kind']> = new Set([
  'timeout',
  'network',
  'server_error',
  'rate_limited',
  'unauthorized',
  'invalid_response',
]);

function inputOf(content: OperationContent): IncidentActionInput {
  switch (content.action) {
    case 'start':
      return {};
    case 'resolve':
      return { diagnosis: content.diagnosis };
    case 'comment':
      return { text: content.text };
    case 'add_evidence':
      return { evidenceId: content.evidenceId };
    default: {
      const unreachable: never = content;
      return unreachable;
    }
  }
}

function needsReconcile(failure: RemoteFailure): boolean {
  return (
    failure.kind === 'forbidden' ||
    failure.kind === 'not_found' ||
    (failure.kind === 'rejected' && failure.status === 409 && (failure.code === 'version_conflict' || failure.code === 'transition_conflict'))
  );
}

function rejection(failure: RemoteFailure): SyncProblem {
  const status =
    failure.kind === 'rejected' || failure.kind === 'server_error'
      ? failure.status
      : failure.kind === 'forbidden'
        ? 403
        : failure.kind === 'not_found'
          ? 404
          : null;
  return { kind: 'rejected', status, code: failure.kind === 'rejected' ? failure.code : failure.kind };
}

type Decision =
  | Readonly<{ kind: 'rebase'; version: number; fields: SyncFields }>
  | Readonly<{ kind: 'already_applied'; snapshot: IncidentSnapshot }>
  | Readonly<{ kind: 'conflict'; problem: SyncProblem; snapshot: IncidentSnapshot | null }>
  | Readonly<{ kind: 'unconfirmed'; failure: RemoteFailure['kind'] }>
  | Readonly<{ kind: 'rejected' }>;

export function createSyncEngine(options: SyncEngineOptions): SyncEngine {
  const { store, gateway, actor } = options;
  const now = () => (options.clock === undefined ? Date.now() : options.clock.now());

  function snapshotOf(remote: RemoteIncident): IncidentSnapshot | null {
    return remote.kind === 'available' ? { incident: remote.incident, version: remote.version, cachedAt: now() } : null;
  }

  async function send(operation: PendingOperation): Promise<RemoteResult<ActedIncident>> {
    store.recordAttempt(operation.operationId);
    return gateway.act(
      operation.incidentId,
      operation.content.action,
      inputOf(operation.content),
      operation.baseVersion,
      operation.operationId,
    );
  }

  async function reconcile(operation: PendingOperation, failure: RemoteFailure): Promise<Decision> {
    const remote = await gateway.get(operation.incidentId);
    if (!remote.ok) {
      if (remote.failure.kind === 'forbidden' || remote.failure.kind === 'not_found') {
        // The actor can no longer see the incident: its assignment changed.
        return {
          kind: 'conflict',
          problem: { kind: 'conflict', reason: 'assignment_changed', fields: ['work'], remoteVersion: null },
          snapshot: null,
        };
      }
      return UNCONFIRMED.has(remote.failure.kind) ? { kind: 'unconfirmed', failure: remote.failure.kind } : { kind: 'rejected' };
    }
    if (remote.value.kind !== 'available') {
      // The server withheld the details: there is nothing to compare against.
      return {
        kind: 'conflict',
        problem: { kind: 'conflict', reason: 'concurrent_edit', fields: ['work'], remoteVersion: remote.value.summary.version },
        snapshot: null,
      };
    }
    const snapshot = snapshotOf(remote.value) as IncidentSnapshot;
    const remoteFields = syncFieldsOf(remote.value.incident);
    const resolution = resolveSync(
      { id: operation.incidentId, version: operation.baseVersion, fields: operation.baseFields },
      { id: operation.incidentId, version: operation.baseVersion, fields: localFieldsAfter(operation.baseFields, operation) },
      { id: operation.incidentId, version: remote.value.version, fields: remoteFields },
    );
    if (resolution.kind === 'conflict') {
      return {
        kind: 'conflict',
        problem: {
          kind: 'conflict',
          reason: failure.kind === 'forbidden' ? 'assignment_changed' : 'concurrent_edit',
          fields: resolution.fields,
          remoteVersion: remote.value.version,
        },
        snapshot,
      };
    }
    if (failure.kind === 'forbidden') {
      // Visible and compatible, yet refused: the server's role policy decides.
      return { kind: 'rejected' };
    }
    if (canonicalJson(resolution.fields) === canonicalJson(remoteFields)) {
      // The server already shows the local intention (for example, already started).
      return { kind: 'already_applied', snapshot };
    }
    if (remote.value.version === operation.baseVersion) {
      return { kind: 'rejected' };
    }
    return { kind: 'rebase', version: remote.value.version, fields: remoteFields };
  }

  return {
    async sync() {
      const confirmed: string[] = [];
      const replayed: string[] = [];
      const rebased: string[] = [];
      const conflicts: string[] = [];
      const rejected: string[] = [];
      const held: string[] = [];
      const pending: string[] = [];
      let stoppedBy: RemoteFailure['kind'] | null = null;

      const queue = [...deduplicateOperations(store.pending()).filter((operation) => operation.actorId === actor.id)];
      const blocked = new Set<string>();

      function confirm(operation: PendingOperation, index: number, snapshot: IncidentSnapshot | null): void {
        store.confirm(operation.operationId, snapshot);
        confirmed.push(operation.operationId);
        if (snapshot === null) {
          return;
        }
        // Later changes of the same incident were based on the same copy; the
        // confirmed copy is that copy plus this change, so they move onto it.
        for (let next = index + 1; next < queue.length; next += 1) {
          const later = queue[next];
          if (later?.incidentId === operation.incidentId && later.state === 'pending' && later.baseVersion === operation.baseVersion) {
            const fields = syncFieldsOf(snapshot.incident);
            store.rebase(later.operationId, snapshot.version, fields);
            queue[next] = { ...later, baseVersion: snapshot.version, baseFields: fields };
          }
        }
      }

      for (let index = 0; index < queue.length; index += 1) {
        let operation = queue[index];
        if (operation === undefined) {
          continue;
        }
        if (operation.state !== 'pending') {
          held.push(operation.operationId);
          blocked.add(operation.incidentId);
          continue;
        }
        if (stoppedBy !== null || blocked.has(operation.incidentId)) {
          pending.push(operation.operationId);
          continue;
        }

        let result = await send(operation);
        if (!result.ok && needsReconcile(result.failure)) {
          const decision = await reconcile(operation, result.failure);
          if (decision.kind === 'already_applied') {
            confirm(operation, index, decision.snapshot);
            continue;
          }
          if (decision.kind === 'conflict') {
            store.markProblem(operation.operationId, decision.problem);
            if (decision.snapshot !== null) {
              store.saveIncident(decision.snapshot);
            }
            conflicts.push(operation.operationId);
            blocked.add(operation.incidentId);
            continue;
          }
          if (decision.kind === 'unconfirmed') {
            stoppedBy = decision.failure;
            pending.push(operation.operationId);
            continue;
          }
          if (decision.kind === 'rebase') {
            store.rebase(operation.operationId, decision.version, decision.fields);
            operation = { ...operation, baseVersion: decision.version, baseFields: decision.fields };
            queue[index] = operation;
            rebased.push(operation.operationId);
            result = await send(operation);
          }
        }

        if (result.ok) {
          if (result.value.duplicate) {
            replayed.push(operation.operationId);
          }
          confirm(operation, index, snapshotOf(result.value.incident));
          continue;
        }
        if (UNCONFIRMED.has(result.failure.kind)) {
          stoppedBy = result.failure.kind;
          pending.push(operation.operationId);
          continue;
        }
        store.markProblem(operation.operationId, rejection(result.failure));
        rejected.push(operation.operationId);
        blocked.add(operation.incidentId);
      }

      return { confirmed, replayed, rebased, conflicts, rejected, held, pending, stoppedBy };
    },
  };
}
