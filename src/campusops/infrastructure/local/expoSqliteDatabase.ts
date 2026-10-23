import { openDatabaseSync } from 'expo-sqlite';

import type { SqlDatabase, SqlRow } from './sqlDatabase';

export const LOCAL_DATABASE_NAME = 'campusops.db';

/** SqlDatabase over expo-sqlite, the app's on-device SQLite file. */
export function openExpoSqliteDatabase(name: string = LOCAL_DATABASE_NAME): SqlDatabase {
  const db = openDatabaseSync(name);
  return {
    exec: (sql) => db.execSync(sql),
    run: (sql, params = []) => {
      const result = db.runSync(sql, [...params]);
      return { changes: result.changes };
    },
    all: (sql, params = []) => db.getAllSync<SqlRow>(sql, [...params]),
    close: () => db.closeSync(),
  };
}
