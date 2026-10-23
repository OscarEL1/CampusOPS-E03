import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { LEGACY_V1_DDL, type LegacyIncidentV1, type LegacyOutboxItemV1 } from '../../src/campusops/infrastructure/local/localSchema';
import {
  readUserVersion,
  tableNames,
  type SqlDatabase,
  type SqlRow,
  type SqlValue,
} from '../../src/campusops/infrastructure/local/sqlDatabase';

/**
 * Week 08 test support. The app runs its SQL on expo-sqlite; the tests run the
 * same SQL on node:sqlite, a real SQLite engine, so transactions, rollback,
 * constraints and a file that outlives its connection are all real.
 */

export function openNodeSqliteDatabase(path: string = ':memory:'): SqlDatabase {
  const db = new DatabaseSync(path);
  return {
    exec: (sql) => db.exec(sql),
    run: (sql, params: readonly SqlValue[] = []) => ({ changes: Number(db.prepare(sql).run(...params).changes) }),
    all: (sql, params: readonly SqlValue[] = []) => db.prepare(sql).all(...params) as SqlRow[],
    close: () => db.close(),
  };
}

/** A database file in a fresh temporary folder: closing and reopening it is a real app restart. */
export function temporaryDatabasePath(name = 'campusops.db'): string {
  return join(mkdtempSync(join(tmpdir(), 'campusops-week08-')), name);
}

/** Writes data in the earlier layout (schema 1), as a build before week 08 left it. */
export function seedLegacySchemaV1(
  db: SqlDatabase,
  data: Readonly<{ incidents: readonly LegacyIncidentV1[]; outbox: readonly LegacyOutboxItemV1[] }>,
): void {
  db.exec(LEGACY_V1_DDL);
  db.run('INSERT INTO kv_store (key, value) VALUES (?, ?)', ['incidents', JSON.stringify(data.incidents)]);
  db.run('INSERT INTO kv_store (key, value) VALUES (?, ?)', ['outbox', JSON.stringify(data.outbox)]);
  db.exec('PRAGMA user_version = 1');
}

/** Everything a migration could leave behind, to compare states before, after a failure and after recovery. */
export function describeState(db: SqlDatabase) {
  const tables = tableNames(db);
  return {
    userVersion: readUserVersion(db),
    tables,
    legacy: tables.includes('kv_store')
      ? db.all('SELECT key, value FROM kv_store ORDER BY key').map((row) => ({ key: String(row.key), value: String(row.value) }))
      : null,
    incidents: tables.includes('incidents') ? db.all('SELECT id, version FROM incidents ORDER BY id').map((row) => String(row.id)) : null,
    operations: tables.includes('pending_operations')
      ? db.all('SELECT operation_id FROM pending_operations ORDER BY seq').map((row) => String(row.operation_id))
      : null,
  };
}
