/**
 * The SQLite surface CampusOps uses. Synchronous, because both engines offer
 * it: expo-sqlite in the app and node:sqlite in the tests run the same SQL, so
 * the tests exercise real transactions, real constraints and a real file that
 * outlives the connection.
 */

export type SqlValue = string | number | null;

export type SqlRow = Readonly<Record<string, unknown>>;

export interface SqlDatabase {
  exec(sql: string): void;
  run(sql: string, params?: readonly SqlValue[]): Readonly<{ changes: number }>;
  all(sql: string, params?: readonly SqlValue[]): readonly SqlRow[];
  close(): void;
}

/**
 * Runs `work` as one SQLite transaction. Either everything it wrote is
 * committed or, if anything throws, nothing is: SQLite rolls back data, DDL
 * and `PRAGMA user_version` alike.
 */
export function inTransaction<T>(db: SqlDatabase, work: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // No transaction left to undo (for example, the connection was closed).
      // SQLite discards uncommitted work when the database is opened again.
    }
    throw error;
  }
}

export function readUserVersion(db: SqlDatabase): number {
  const row = db.all('PRAGMA user_version')[0];
  const value = row?.user_version;
  return typeof value === 'number' ? value : Number(value ?? 0);
}

export function tableNames(db: SqlDatabase): readonly string[] {
  return db
    .all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .map((row) => String(row.name));
}
