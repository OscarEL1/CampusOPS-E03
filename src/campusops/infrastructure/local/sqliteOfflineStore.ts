import type { IncidentCategory, IncidentStatus } from '../../contracts';
import type {
  IncidentSnapshot,
  NewPendingOperation,
  OfflineStore,
  OperationContent,
  OperationState,
  PendingOperation,
  SyncProblem,
} from '../../domain/offlineQueue';
import type { SyncFields } from '../../domain/syncMerge';
import { prepareLocalSchema, type SchemaOptions, type SchemaResult } from './localSchema';
import { inTransaction, type SqlDatabase, type SqlRow } from './sqlDatabase';

/**
 * OfflineStore over SQLite (schema 2, see localSchema). Tokens never live
 * here: the session stays in the secure store. A row that cannot be read back
 * is left in the table untouched and kept out of the sync, never deleted.
 */

function parseObject(value: unknown): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(String(value));
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function contentOf(action: unknown, raw: unknown): OperationContent | null {
  const content = parseObject(raw);
  if (content === null || content.action !== action) {
    return null;
  }
  switch (action) {
    case 'start':
      return { action };
    case 'resolve':
      return typeof content.diagnosis === 'string' ? { action, diagnosis: content.diagnosis } : null;
    case 'comment':
      return typeof content.text === 'string' ? { action, text: content.text } : null;
    case 'add_evidence':
      return typeof content.evidenceId === 'string' ? { action, evidenceId: content.evidenceId } : null;
    default:
      return null;
  }
}

function operationOf(row: SqlRow): PendingOperation | null {
  const content = contentOf(row.action, row.content_json);
  const baseFields = parseObject(row.base_fields_json);
  if (content === null || baseFields === null) {
    return null;
  }
  const problem = row.problem_json === null ? null : (parseObject(row.problem_json) as SyncProblem | null);
  return {
    operationId: String(row.operation_id),
    incidentId: String(row.incident_id),
    actorId: String(row.actor_id),
    content,
    baseVersion: Number(row.base_version),
    baseFields,
    createdAt: Number(row.created_at),
    attempts: Number(row.attempts),
    state: row.state as OperationState,
    problem,
  };
}

function snapshotOf(row: SqlRow): IncidentSnapshot {
  return {
    incident: {
      id: String(row.id),
      title: String(row.title),
      category: row.category as IncidentCategory,
      description: String(row.description),
      location: String(row.location),
      status: row.status as IncidentStatus,
      reporterId: String(row.reporter_id),
      assignedTechnicianId: row.assigned_technician_id === null ? null : String(row.assigned_technician_id),
    },
    version: Number(row.version),
    cachedAt: Number(row.cached_at),
  };
}

const UPSERT_INCIDENT = `
INSERT INTO incidents (id, version, status, title, category, description, location, reporter_id, assigned_technician_id, cached_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (id) DO UPDATE SET
  version = excluded.version, status = excluded.status, title = excluded.title, category = excluded.category,
  description = excluded.description, location = excluded.location, reporter_id = excluded.reporter_id,
  assigned_technician_id = excluded.assigned_technician_id, cached_at = excluded.cached_at
WHERE excluded.version >= incidents.version`;

export function createSqliteOfflineStore(db: SqlDatabase): OfflineStore {
  function saveIncident(snapshot: IncidentSnapshot): void {
    const { incident } = snapshot;
    db.run(UPSERT_INCIDENT, [
      incident.id,
      snapshot.version,
      incident.status,
      incident.title,
      incident.category,
      incident.description,
      incident.location,
      incident.reporterId,
      incident.assignedTechnicianId,
      snapshot.cachedAt,
    ]);
  }

  return {
    saveIncident,

    incident(id) {
      const row = db.all('SELECT * FROM incidents WHERE id = ?', [id])[0];
      return row === undefined ? null : snapshotOf(row);
    },

    enqueue(operation: NewPendingOperation) {
      const { changes } = db.run(
        `INSERT INTO pending_operations (operation_id, incident_id, actor_id, action, content_json, base_version, base_fields_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (operation_id) DO NOTHING`,
        [
          operation.operationId,
          operation.incidentId,
          operation.actorId,
          operation.content.action,
          JSON.stringify(operation.content),
          operation.baseVersion,
          JSON.stringify(operation.baseFields),
          operation.createdAt,
        ],
      );
      return changes > 0 ? 'queued' : 'duplicate';
    },

    pending() {
      return db
        .all('SELECT * FROM pending_operations ORDER BY seq')
        .map(operationOf)
        .filter((operation): operation is PendingOperation => operation !== null);
    },

    recordAttempt(operationId) {
      db.run('UPDATE pending_operations SET attempts = attempts + 1 WHERE operation_id = ?', [operationId]);
    },

    confirm(operationId, confirmed) {
      inTransaction(db, () => {
        db.run('DELETE FROM pending_operations WHERE operation_id = ?', [operationId]);
        if (confirmed !== null) {
          saveIncident(confirmed);
        }
      });
    },

    markProblem(operationId, problem) {
      db.run('UPDATE pending_operations SET state = ?, problem_json = ? WHERE operation_id = ?', [
        problem.kind === 'conflict' ? 'conflict' : 'rejected',
        JSON.stringify(problem),
        operationId,
      ]);
    },

    rebase(operationId, baseVersion, baseFields: SyncFields) {
      db.run(
        "UPDATE pending_operations SET base_version = ?, base_fields_json = ?, state = 'pending', problem_json = NULL WHERE operation_id = ?",
        [baseVersion, JSON.stringify(baseFields), operationId],
      );
    },

    reopen(operationId) {
      db.run("UPDATE pending_operations SET state = 'pending', problem_json = NULL WHERE operation_id = ?", [operationId]);
    },

    discard(operationId) {
      db.run('DELETE FROM pending_operations WHERE operation_id = ?', [operationId]);
    },
  };
}

export type OpenedOfflineStore = Readonly<{ store: OfflineStore; schema: SchemaResult }>;

/** Prepares the schema (migrating if needed) and returns the store. */
export function openOfflineStore(db: SqlDatabase, options: SchemaOptions = {}): OpenedOfflineStore {
  const schema = prepareLocalSchema(db, options);
  return { store: createSqliteOfflineStore(db), schema };
}
