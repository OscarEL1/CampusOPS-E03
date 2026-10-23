import type { IncidentStatus } from '../contracts';
import type { Incident } from './incident';
import type { SyncFields } from './syncMerge';

/**
 * Persistent queue of work done without connection (week 08).
 *
 * Every pending change carries a stable `operationId` (also its
 * Idempotency-Key), the incident, its author, its content and the version and
 * fields it was based on. The queue lives in local storage, not in memory, so
 * it survives closing the app. An operation leaves the queue only when the
 * server confirms it; an error or a conflict keeps it.
 */

export type OperationContent =
  | Readonly<{ action: 'start' }>
  | Readonly<{ action: 'resolve'; diagnosis: string }>
  | Readonly<{ action: 'comment'; text: string }>
  /** A reference to a photo still pending upload. It does not prove the image was uploaded. */
  | Readonly<{ action: 'add_evidence'; evidenceId: string }>;

export type QueuedAction = OperationContent['action'];

export type SyncProblem =
  | Readonly<{
      kind: 'conflict';
      /**
       * `assignment_changed`: the server no longer lets this actor see or work
       * the incident, so its assignment changed. `concurrent_edit`: the server
       * copy changed the same field to different content.
       */
      reason: 'assignment_changed' | 'concurrent_edit';
      fields: readonly string[];
      remoteVersion: number | null;
    }>
  | Readonly<{ kind: 'rejected'; status: number | null; code: string | null }>;

/** `pending` is sent on the next sync; `conflict` and `rejected` wait for an explicit decision. */
export type OperationState = 'pending' | 'conflict' | 'rejected';

export type PendingOperation = Readonly<{
  operationId: string;
  incidentId: string;
  actorId: string;
  content: OperationContent;
  baseVersion: number;
  baseFields: SyncFields;
  createdAt: number;
  attempts: number;
  state: OperationState;
  problem: SyncProblem | null;
}>;

export type NewPendingOperation = Pick<
  PendingOperation,
  'operationId' | 'incidentId' | 'actorId' | 'content' | 'baseVersion' | 'baseFields' | 'createdAt'
>;

/** The last server copy of an incident kept on the device. */
export type IncidentSnapshot = Readonly<{ incident: Incident; version: number; cachedAt: number }>;

/** Domain port for local storage. Synchronous, as the SQLite adapters are. */
export interface OfflineStore {
  /** Stores a server copy; never replaces a newer cached version with an older one. */
  saveIncident(snapshot: IncidentSnapshot): void;
  incident(id: string): IncidentSnapshot | null;
  /** `duplicate` when the operationId is already queued: the first one is kept. */
  enqueue(operation: NewPendingOperation): 'queued' | 'duplicate';
  /** All queued operations in the order they were created. */
  pending(): readonly PendingOperation[];
  recordAttempt(operationId: string): void;
  /** Removes a confirmed operation and stores the server copy in one transaction. */
  confirm(operationId: string, confirmed: IncidentSnapshot | null): void;
  markProblem(operationId: string, problem: SyncProblem): void;
  /** Moves an operation onto a newer server version after a compatible merge. */
  rebase(operationId: string, baseVersion: number, baseFields: SyncFields): void;
  /** Explicit decision: send a conflicting or rejected operation again. */
  reopen(operationId: string): void;
  /** Explicit decision: drop an operation. Never called by the sync itself. */
  discard(operationId: string): void;
}

type Work = Readonly<{ assignedTechnicianId?: string | null; status?: IncidentStatus }>;

/** The fields as the local intention leaves them, for reconciliation. */
export function localFieldsAfter(base: SyncFields, operation: Pick<PendingOperation, 'operationId' | 'content'>): SyncFields {
  const work = (base.work ?? {}) as Work;
  switch (operation.content.action) {
    case 'start':
      return { ...base, work: { ...work, status: 'in_progress' } };
    case 'resolve':
      return { ...base, work: { ...work, status: 'resolved' }, diagnosis: operation.content.diagnosis };
    case 'comment':
      return { ...base, [`note:${operation.operationId}`]: operation.content.text };
    case 'add_evidence':
      return { ...base, [`evidence:${operation.content.evidenceId}`]: 'pending_upload' };
    default: {
      const unreachable: never = operation.content;
      return unreachable;
    }
  }
}

export type LocalIncidentView = Readonly<{
  snapshot: IncidentSnapshot;
  /** Status the technician sees while their changes wait: the last pending start or resolve. */
  localStatus: IncidentStatus;
  operations: readonly PendingOperation[];
  hasConflict: boolean;
}>;

export function localViewOf(snapshot: IncidentSnapshot, operations: readonly PendingOperation[]): LocalIncidentView {
  const own = operations.filter((operation) => operation.incidentId === snapshot.incident.id);
  let localStatus = snapshot.incident.status;
  for (const operation of own) {
    if (operation.state !== 'pending') {
      continue;
    }
    if (operation.content.action === 'start') {
      localStatus = 'in_progress';
    } else if (operation.content.action === 'resolve') {
      localStatus = 'resolved';
    }
  }
  return { snapshot, localStatus, operations: own, hasConflict: own.some((operation) => operation.state === 'conflict') };
}
