import { canResolveIncident, canViewIncident, type CampusActor } from '../domain/accessPolicy';
import type { RemoteIncident } from '../domain/incidentGateway';
import {
  localViewOf,
  type LocalIncidentView,
  type OfflineStore,
  type OperationContent,
  type PendingOperation,
} from '../domain/offlineQueue';
import type { Clock } from '../domain/session';
import { syncFieldsOf } from '../domain/syncMerge';
import { newIdempotencyKey } from './remoteIncidentQueries';

/**
 * Work a technician records without connection (week 08). Each change is
 * written to the persistent queue with a new, stable operationId and the
 * version and fields of the last server copy the device holds. The week 06
 * role policy applies before anything is queued: only the assigned technician
 * starts or resolves; notes and photo references need the incident visible.
 */

export type OfflineWorkResult =
  | Readonly<{ ok: true; operationId: string; duplicate: boolean }>
  | Readonly<{ ok: false; reason: 'not_cached' | 'forbidden' | 'invalid' }>;

export type OfflineWork = Readonly<{
  /** Keeps the server copy of an incident read while online, so it can be worked offline. */
  cache(remote: RemoteIncident): void;
  startWork(incidentId: string): OfflineWorkResult;
  resolve(incidentId: string, diagnosis: string): OfflineWorkResult;
  addNote(incidentId: string, text: string): OfflineWorkResult;
  /** Queues a reference to a photo still to upload. It does not mean the image was uploaded. */
  addPhotoReference(incidentId: string, evidenceId: string): OfflineWorkResult;
  /** This actor's queued operations, in order. */
  pending(): readonly PendingOperation[];
  view(incidentId: string): LocalIncidentView | null;
  /** Explicit decision on a conflict or rejection: send it again on the next sync. */
  retry(operationId: string): boolean;
  /** Explicit decision: drop this actor's queued operation. */
  discard(operationId: string): boolean;
}>;

export type OfflineWorkOptions = Readonly<{
  store: OfflineStore;
  actor: CampusActor;
  clock: Clock;
  newOperationId?: () => string;
}>;

const MAX_TEXT_LENGTH = 2000;

function cleanText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_TEXT_LENGTH ? trimmed : null;
}

export function createOfflineWork(options: OfflineWorkOptions): OfflineWork {
  const { store, actor, clock } = options;
  const newOperationId = options.newOperationId ?? newIdempotencyKey;

  function own(): readonly PendingOperation[] {
    return store.pending().filter((operation) => operation.actorId === actor.id);
  }

  function enqueue(incidentId: string, content: OperationContent): OfflineWorkResult {
    const snapshot = store.incident(incidentId);
    if (snapshot === null) {
      return { ok: false, reason: 'not_cached' };
    }
    const allowed =
      content.action === 'start' || content.action === 'resolve'
        ? canResolveIncident(actor, snapshot.incident)
        : canViewIncident(actor, snapshot.incident);
    if (!allowed) {
      return { ok: false, reason: 'forbidden' };
    }
    if (content.action === 'start' || content.action === 'resolve') {
      // A second tap on the same state change is the same intention, not a new one.
      const same = own().find(
        (operation) => operation.incidentId === incidentId && operation.content.action === content.action,
      );
      if (same !== undefined) {
        return { ok: true, operationId: same.operationId, duplicate: true };
      }
    }
    const operationId = newOperationId();
    const outcome = store.enqueue({
      operationId,
      incidentId,
      actorId: actor.id,
      content,
      baseVersion: snapshot.version,
      baseFields: syncFieldsOf(snapshot.incident),
      createdAt: clock.now(),
    });
    return { ok: true, operationId, duplicate: outcome === 'duplicate' };
  }

  function ownOperation(operationId: string): PendingOperation | undefined {
    return own().find((operation) => operation.operationId === operationId);
  }

  return {
    cache(remote) {
      if (remote.kind === 'available') {
        store.saveIncident({ incident: remote.incident, version: remote.version, cachedAt: clock.now() });
      }
    },

    startWork: (incidentId) => enqueue(incidentId, { action: 'start' }),

    resolve(incidentId, diagnosis) {
      const clean = cleanText(diagnosis);
      return clean === null ? { ok: false, reason: 'invalid' } : enqueue(incidentId, { action: 'resolve', diagnosis: clean });
    },

    addNote(incidentId, text) {
      const clean = cleanText(text);
      return clean === null ? { ok: false, reason: 'invalid' } : enqueue(incidentId, { action: 'comment', text: clean });
    },

    addPhotoReference(incidentId, evidenceId) {
      const clean = cleanText(evidenceId);
      return clean === null ? { ok: false, reason: 'invalid' } : enqueue(incidentId, { action: 'add_evidence', evidenceId: clean });
    },

    pending: own,

    view(incidentId) {
      const snapshot = store.incident(incidentId);
      return snapshot === null ? null : localViewOf(snapshot, own());
    },

    retry(operationId) {
      const operation = ownOperation(operationId);
      if (operation === undefined || operation.state === 'pending') {
        return false;
      }
      store.reopen(operationId);
      return true;
    },

    discard(operationId) {
      if (ownOperation(operationId) === undefined) {
        return false;
      }
      store.discard(operationId);
      return true;
    },
  };
}
