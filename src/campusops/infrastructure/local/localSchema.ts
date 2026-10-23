import { syncFieldsOf } from '../../domain/syncMerge';
import { inTransaction, readUserVersion, type SqlDatabase } from './sqlDatabase';

/**
 * Local schema of CampusOps and its migrations (week 08).
 *
 * The schema version is SQLite's `PRAGMA user_version`. A migration runs as a
 * single transaction: if any step fails, the database is left exactly as it
 * was in the previous version (data, tables and version number), and the next
 * start simply runs the migration again. A schema newer than this build is
 * never touched.
 */

export const SCHEMA_VERSION = 2;
export const LEGACY_SCHEMA_VERSION = 1;

/**
 * Schema 1, the earlier layout: one key-value table of JSON documents. Key
 * `incidents` holds an array of cached incidents and key `outbox` an array of
 * pending changes whose actions used older names (`note`, `photo`). Kept here
 * because the migration must read it, and the tests build it to migrate from.
 */
export const LEGACY_V1_DDL = 'CREATE TABLE kv_store (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);';

export type LegacyIncidentV1 = Readonly<{
  id: string;
  version: number;
  status: string;
  title: string;
  category: string;
  description: string;
  location: string;
  reporterId: string;
  assignedTechnicianId: string | null;
}>;

export type LegacyOutboxItemV1 = Readonly<{
  id: string;
  incidentId: string;
  actorId: string;
  action: 'start' | 'note' | 'photo' | 'resolve';
  body: Readonly<Record<string, string>>;
  baseVersion: number;
  createdAt: number;
}>;

const SCHEMA_V2_DDL = `
CREATE TABLE incidents (
  id TEXT PRIMARY KEY NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 0),
  status TEXT NOT NULL CHECK (status IN ('open', 'assigned', 'in_progress', 'resolved', 'closed')),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  location TEXT NOT NULL,
  reporter_id TEXT NOT NULL,
  assigned_technician_id TEXT,
  cached_at INTEGER NOT NULL
);
CREATE TABLE pending_operations (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_id TEXT NOT NULL UNIQUE CHECK (length(operation_id) >= 8),
  incident_id TEXT NOT NULL REFERENCES incidents (id),
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('start', 'resolve', 'comment', 'add_evidence')),
  content_json TEXT NOT NULL,
  base_version INTEGER NOT NULL CHECK (base_version >= 0),
  base_fields_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'conflict', 'rejected')),
  problem_json TEXT
);
CREATE INDEX pending_operations_by_incident ON pending_operations (incident_id, seq);
`;

/** Points where a test can inject a failure inside the migration transaction. */
export type MigrationStep = 'tables_created' | 'incidents_copied' | 'operations_copied' | 'legacy_removed';

export type SchemaOptions = Readonly<{
  /** Called after each step, inside the transaction. Throwing aborts the whole migration. */
  onMigrationStep?: (step: MigrationStep) => void;
  now?: () => number;
}>;

export type SchemaResult = Readonly<{
  from: number;
  to: number;
  migratedIncidents: number;
  migratedOperations: number;
}>;

export class UnsupportedSchemaError extends Error {
  constructor(readonly found: number) {
    super(`local schema ${String(found)} is newer than this build (${String(SCHEMA_VERSION)})`);
    this.name = 'UnsupportedSchemaError';
  }
}

/** Legacy data that cannot be migrated faithfully. The migration aborts and the data stays in schema 1. */
export class LegacyDataError extends Error {
  constructor(reason: string) {
    super(`legacy data cannot be migrated: ${reason}`);
    this.name = 'LegacyDataError';
  }
}

function readLegacyArray(db: SqlDatabase, key: string): readonly unknown[] {
  const row = db.all('SELECT value FROM kv_store WHERE key = ?', [key])[0];
  if (row === undefined) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(row.value));
  } catch {
    throw new LegacyDataError(`${key} is not valid JSON`);
  }
  if (!Array.isArray(parsed)) {
    throw new LegacyDataError(`${key} is not a list`);
  }
  return parsed;
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new LegacyDataError(`${field} is missing`);
  }
  return value;
}

function version(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new LegacyDataError(`${field} is not a valid version`);
  }
  return value;
}

/** Legacy outbox content in the new action names. */
function legacyContent(item: Record<string, unknown>): Readonly<{ action: string; content: Record<string, string> }> {
  const body = (typeof item.body === 'object' && item.body !== null ? item.body : {}) as Record<string, unknown>;
  switch (item.action) {
    case 'start':
      return { action: 'start', content: { action: 'start' } };
    case 'resolve':
      return { action: 'resolve', content: { action: 'resolve', diagnosis: text(body.diagnosis, 'diagnosis') } };
    case 'note':
      return { action: 'comment', content: { action: 'comment', text: text(body.text, 'note text') } };
    case 'photo':
      return { action: 'add_evidence', content: { action: 'add_evidence', evidenceId: text(body.photoRef, 'photo reference') } };
    default:
      throw new LegacyDataError(`unknown legacy action ${String(item.action)}`);
  }
}

function migrateV1ToV2(db: SqlDatabase, options: SchemaOptions): SchemaResult {
  const step = options.onMigrationStep ?? (() => undefined);
  const now = options.now ?? (() => Date.now());
  return inTransaction(db, () => {
    db.exec(SCHEMA_V2_DDL);
    step('tables_created');

    const cachedWork = new Map<string, Readonly<{ version: number; fields: Readonly<Record<string, unknown>> }>>();
    const incidents = readLegacyArray(db, 'incidents');
    for (const raw of incidents) {
      const item = (raw ?? {}) as Record<string, unknown>;
      const id = text(item.id, 'incident id');
      const status = text(item.status, 'status');
      const assigned = item.assignedTechnicianId === null ? null : text(item.assignedTechnicianId, 'assignedTechnicianId');
      const itemVersion = version(item.version, 'incident version');
      db.run(
        `INSERT INTO incidents (id, version, status, title, category, description, location, reporter_id, assigned_technician_id, cached_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          itemVersion,
          status,
          text(item.title, 'title'),
          text(item.category, 'category'),
          text(item.description, 'description'),
          text(item.location, 'location'),
          text(item.reporterId, 'reporterId'),
          assigned,
          now(),
        ],
      );
      cachedWork.set(id, {
        version: itemVersion,
        fields: syncFieldsOf({ assignedTechnicianId: assigned, status: status as never }),
      });
    }
    step('incidents_copied');

    const outbox = readLegacyArray(db, 'outbox');
    for (const raw of outbox) {
      const item = (raw ?? {}) as Record<string, unknown>;
      const incidentId = text(item.incidentId, 'incidentId');
      const cached = cachedWork.get(incidentId);
      if (cached === undefined) {
        throw new LegacyDataError(`pending change for an incident that is not cached`);
      }
      const baseVersion = version(item.baseVersion, 'baseVersion');
      const { action, content } = legacyContent(item);
      // Schema 1 kept no base fields. The cached copy is the base only when it
      // is that same version; otherwise the base is unknown and stays empty,
      // which makes reconciliation report a conflict instead of guessing.
      const baseFields = cached.version === baseVersion ? cached.fields : {};
      db.run(
        `INSERT INTO pending_operations (operation_id, incident_id, actor_id, action, content_json, base_version, base_fields_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          text(item.id, 'operation id'),
          incidentId,
          text(item.actorId, 'actorId'),
          action,
          JSON.stringify(content),
          baseVersion,
          JSON.stringify(baseFields),
          typeof item.createdAt === 'number' ? item.createdAt : now(),
        ],
      );
    }
    step('operations_copied');

    db.exec('DROP TABLE kv_store');
    step('legacy_removed');

    db.exec(`PRAGMA user_version = ${String(SCHEMA_VERSION)}`);
    return { from: LEGACY_SCHEMA_VERSION, to: SCHEMA_VERSION, migratedIncidents: incidents.length, migratedOperations: outbox.length };
  });
}

/** Brings the database to the current schema. Safe to call on every start. */
export function prepareLocalSchema(db: SqlDatabase, options: SchemaOptions = {}): SchemaResult {
  // Must be set outside a transaction; SQLite ignores it inside one.
  db.exec('PRAGMA foreign_keys = ON');
  const from = readUserVersion(db);
  if (from === SCHEMA_VERSION) {
    return { from, to: from, migratedIncidents: 0, migratedOperations: 0 };
  }
  if (from > SCHEMA_VERSION) {
    throw new UnsupportedSchemaError(from);
  }
  if (from === LEGACY_SCHEMA_VERSION) {
    return migrateV1ToV2(db, options);
  }
  if (from !== 0) {
    throw new UnsupportedSchemaError(from);
  }
  inTransaction(db, () => {
    db.exec(SCHEMA_V2_DDL);
    db.exec(`PRAGMA user_version = ${String(SCHEMA_VERSION)}`);
  });
  return { from: 0, to: SCHEMA_VERSION, migratedIncidents: 0, migratedOperations: 0 };
}
