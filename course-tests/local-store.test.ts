import { createOfflineWork } from '../src/campusops/application/offlineWork';
import type { IncidentSnapshot } from '../src/campusops/domain/offlineQueue';
import { syncFieldsOf } from '../src/campusops/domain/syncMerge';
import {
  LegacyDataError,
  SCHEMA_VERSION,
  UnsupportedSchemaError,
  prepareLocalSchema,
  type LegacyIncidentV1,
  type LegacyOutboxItemV1,
  type MigrationStep,
} from '../src/campusops/infrastructure/local/localSchema';
import { openOfflineStore } from '../src/campusops/infrastructure/local/sqliteOfflineStore';
import { readUserVersion, tableNames } from '../src/campusops/infrastructure/local/sqlDatabase';
import { describeState, openNodeSqliteDatabase, seedLegacySchemaV1, temporaryDatabasePath } from './support/nodeSqliteDatabase';

/**
 * Week 08: local schema, migration and persistent queue on a real SQLite
 * engine (node:sqlite) running the app's SQL. A restart is closing the
 * connection and opening the same file again. All data is fictional.
 */

const clock = { now: () => 1_760_000_000_000 };
const technician = { id: 'technician-1', role: 'technician' } as const;

const ASSIGNED: IncidentSnapshot = {
  incident: {
    id: 'campus-inc-001',
    title: 'Incidencia de conectividad',
    category: 'connectivity',
    description: 'Sin conexión en laboratorio ficticio',
    location: 'Edificio de prueba A',
    status: 'assigned',
    reporterId: 'reporter-1',
    assignedTechnicianId: 'technician-1',
  },
  version: 2,
  cachedAt: clock.now(),
};

const LEGACY_INCIDENTS: readonly LegacyIncidentV1[] = [
  { ...ASSIGNED.incident, version: 2 },
  {
    id: 'campus-inc-002',
    version: 1,
    status: 'open',
    title: 'Incidencia de agua',
    category: 'water',
    description: 'Fuga ficticia en lavabo',
    location: 'Edificio de prueba B',
    reporterId: 'reporter-2',
    assignedTechnicianId: null,
  },
];

const LEGACY_OUTBOX: readonly LegacyOutboxItemV1[] = [
  { id: 'legacy-op-0001', incidentId: 'campus-inc-001', actorId: 'technician-1', action: 'start', body: {}, baseVersion: 2, createdAt: 1 },
  {
    id: 'legacy-op-0002',
    incidentId: 'campus-inc-001',
    actorId: 'technician-1',
    action: 'note',
    body: { text: 'Cable de red ficticio dañado' },
    baseVersion: 2,
    createdAt: 2,
  },
  {
    id: 'legacy-op-0003',
    incidentId: 'campus-inc-001',
    actorId: 'technician-1',
    action: 'photo',
    body: { photoRef: 'photo-ref-legacy-0001' },
    baseVersion: 2,
    createdAt: 3,
  },
];

function legacyDatabase(path = ':memory:', outbox: readonly LegacyOutboxItemV1[] = LEGACY_OUTBOX) {
  const db = openNodeSqliteDatabase(path);
  seedLegacySchemaV1(db, { incidents: LEGACY_INCIDENTS, outbox });
  return db;
}

describe('schema', () => {
  test('a fresh install creates schema 2 in one step', () => {
    const db = openNodeSqliteDatabase();
    expect(prepareLocalSchema(db)).toEqual({ from: 0, to: SCHEMA_VERSION, migratedIncidents: 0, migratedOperations: 0 });
    expect(readUserVersion(db)).toBe(2);
    expect(tableNames(db)).toEqual(['incidents', 'pending_operations']);
    expect(prepareLocalSchema(db)).toEqual({ from: 2, to: 2, migratedIncidents: 0, migratedOperations: 0 });
  });

  test('a schema newer than this build is refused and left untouched', () => {
    const db = openNodeSqliteDatabase();
    db.exec('CREATE TABLE future_table (id TEXT); PRAGMA user_version = 3;');
    expect(() => prepareLocalSchema(db)).toThrow(UnsupportedSchemaError);
    expect(describeState(db)).toMatchObject({ userVersion: 3, tables: ['future_table'] });
  });
});

describe('persistent queue across a restart', () => {
  test('a technician queues work offline; after closing and reopening the app it is all there, same identity and content', () => {
    const path = temporaryDatabasePath();
    const first = openNodeSqliteDatabase(path);
    const opened = openOfflineStore(first);
    const work = createOfflineWork({ store: opened.store, actor: technician, clock });
    work.cache({ kind: 'available', incident: ASSIGNED.incident, version: ASSIGNED.version });

    const start = work.startWork('campus-inc-001');
    const note = work.addNote('campus-inc-001', '  Cable de red ficticio dañado  ');
    const photo = work.addPhotoReference('campus-inc-001', 'photo-ref-week08-0001');
    const before = work.pending();
    first.close();

    const second = openNodeSqliteDatabase(path);
    const reopened = openOfflineStore(second);
    const after = createOfflineWork({ store: reopened.store, actor: technician, clock });

    expect(reopened.schema).toEqual({ from: 2, to: 2, migratedIncidents: 0, migratedOperations: 0 });
    expect(after.pending()).toEqual(before);
    expect(after.pending().map((operation) => operation.operationId)).toEqual(
      [start, note, photo].map((result) => (result.ok ? result.operationId : 'missing')),
    );
    expect(after.pending().map((operation) => operation.content)).toEqual([
      { action: 'start' },
      { action: 'comment', text: 'Cable de red ficticio dañado' },
      { action: 'add_evidence', evidenceId: 'photo-ref-week08-0001' },
    ]);
    for (const operation of after.pending()) {
      expect(operation).toMatchObject({
        incidentId: 'campus-inc-001',
        actorId: 'technician-1',
        baseVersion: 2,
        baseFields: syncFieldsOf(ASSIGNED.incident),
        state: 'pending',
        attempts: 0,
      });
    }
    expect(after.view('campus-inc-001')).toMatchObject({ localStatus: 'in_progress', hasConflict: false });
    second.close();
  });

  test('the same operationId is stored once, and a second tap on start is the same intention', () => {
    const db = openNodeSqliteDatabase();
    const { store } = openOfflineStore(db);
    const work = createOfflineWork({ store, actor: technician, clock });
    work.cache({ kind: 'available', incident: ASSIGNED.incident, version: ASSIGNED.version });
    const operation = {
      operationId: 'fixed-operation-0001',
      incidentId: 'campus-inc-001',
      actorId: 'technician-1',
      content: { action: 'comment', text: 'Nota ficticia' } as const,
      baseVersion: 2,
      baseFields: syncFieldsOf(ASSIGNED.incident),
      createdAt: 1,
    };
    expect(store.enqueue(operation)).toBe('queued');
    expect(store.enqueue({ ...operation, content: { action: 'comment', text: 'Otro contenido' } })).toBe('duplicate');
    expect(store.pending().map((item) => item.content)).toEqual([{ action: 'comment', text: 'Nota ficticia' }]);

    const first = work.startWork('campus-inc-001');
    const again = work.startWork('campus-inc-001');
    expect(again).toEqual({ ok: true, operationId: first.ok ? first.operationId : '', duplicate: true });
    expect(store.pending()).toHaveLength(2);
  });

  test('the week 06 role policy applies before anything is queued', () => {
    const { store } = openOfflineStore(openNodeSqliteDatabase());
    store.saveIncident(ASSIGNED);
    const otherTechnician = createOfflineWork({ store, actor: { id: 'technician-2', role: 'technician' }, clock });
    const reporter = createOfflineWork({ store, actor: { id: 'reporter-1', role: 'reporter' }, clock });
    const assigned = createOfflineWork({ store, actor: technician, clock });

    expect(otherTechnician.startWork('campus-inc-001')).toEqual({ ok: false, reason: 'forbidden' });
    expect(otherTechnician.addNote('campus-inc-001', 'Nota')).toEqual({ ok: false, reason: 'forbidden' });
    expect(reporter.startWork('campus-inc-001')).toEqual({ ok: false, reason: 'forbidden' });
    expect(assigned.startWork('campus-inc-999')).toEqual({ ok: false, reason: 'not_cached' });
    expect(assigned.addNote('campus-inc-001', '   ')).toEqual({ ok: false, reason: 'invalid' });
    expect(store.pending()).toEqual([]);
    expect(reporter.addNote('campus-inc-001', 'Información posterior ficticia').ok).toBe(true);
  });
});

describe('migration from schema 1', () => {
  test('incidents and pending changes survive the migration with the same identity', () => {
    const db = legacyDatabase();
    const before = describeState(db);
    expect(before).toMatchObject({ userVersion: 1, tables: ['kv_store'], incidents: null, operations: null });

    const { store, schema } = openOfflineStore(db, { now: clock.now });

    expect(schema).toEqual({ from: 1, to: 2, migratedIncidents: 2, migratedOperations: 3 });
    expect(describeState(db)).toEqual({
      userVersion: 2,
      tables: ['incidents', 'pending_operations'],
      legacy: null,
      incidents: ['campus-inc-001', 'campus-inc-002'],
      operations: ['legacy-op-0001', 'legacy-op-0002', 'legacy-op-0003'],
    });
    expect(store.incident('campus-inc-001')).toMatchObject({ incident: ASSIGNED.incident, version: 2 });
    expect(store.pending().map((operation) => operation.content)).toEqual([
      { action: 'start' },
      { action: 'comment', text: 'Cable de red ficticio dañado' },
      { action: 'add_evidence', evidenceId: 'photo-ref-legacy-0001' },
    ]);
    expect(store.pending()[0]).toMatchObject({ baseVersion: 2, baseFields: syncFieldsOf(ASSIGNED.incident), createdAt: 1 });
  });

  const steps: readonly MigrationStep[] = ['tables_created', 'incidents_copied', 'operations_copied', 'legacy_removed'];

  test.each(steps)('a failure after %s rolls everything back, and the next start migrates cleanly', (failing) => {
    const db = legacyDatabase();
    const before = describeState(db);

    expect(() =>
      prepareLocalSchema(db, {
        onMigrationStep: (step) => {
          if (step === failing) {
            throw new Error(`injected failure after ${step}`);
          }
        },
      }),
    ).toThrow(`injected failure after ${failing}`);

    const afterFailure = describeState(db);
    expect(afterFailure).toEqual(before);

    const recovered = prepareLocalSchema(db);
    expect(recovered).toEqual({ from: 1, to: 2, migratedIncidents: 2, migratedOperations: 3 });
    expect(describeState(db)).toMatchObject({
      userVersion: 2,
      legacy: null,
      operations: ['legacy-op-0001', 'legacy-op-0002', 'legacy-op-0003'],
    });
  });

  test('the app stopping in the middle of the migration leaves schema 1 intact on the next start', () => {
    const path = temporaryDatabasePath();
    const db = legacyDatabase(path);
    const before = describeState(db);

    expect(() =>
      prepareLocalSchema(db, {
        onMigrationStep: (step) => {
          if (step === 'operations_copied') {
            db.close();
            throw new Error('app stopped');
          }
        },
      }),
    ).toThrow('app stopped');

    const reopened = openNodeSqliteDatabase(path);
    expect(describeState(reopened)).toEqual(before);
    expect(prepareLocalSchema(reopened)).toMatchObject({ from: 1, to: 2, migratedOperations: 3 });
    expect(describeState(reopened).operations).toEqual(['legacy-op-0001', 'legacy-op-0002', 'legacy-op-0003']);
    reopened.close();
  });

  test('legacy data that cannot be migrated faithfully aborts the migration and stays in schema 1', () => {
    const orphan = [...LEGACY_OUTBOX, { ...LEGACY_OUTBOX[0]!, id: 'legacy-op-0099', incidentId: 'campus-inc-404' }];
    const db = legacyDatabase(':memory:', orphan);
    const before = describeState(db);
    expect(() => prepareLocalSchema(db)).toThrow(LegacyDataError);
    expect(describeState(db)).toEqual(before);

    const unknownAction = [{ ...LEGACY_OUTBOX[0]!, action: 'teleport' as never }];
    const other = legacyDatabase(':memory:', unknownAction);
    expect(() => prepareLocalSchema(other)).toThrow(LegacyDataError);
    expect(describeState(other).userVersion).toBe(1);
  });

  test('a change whose base is not the cached copy keeps an empty base instead of guessing', () => {
    const stale = [{ ...LEGACY_OUTBOX[0]!, baseVersion: 1 }];
    const { store } = openOfflineStore(legacyDatabase(':memory:', stale));
    expect(store.pending()[0]).toMatchObject({ baseVersion: 1, baseFields: {} });
  });
});

describe('store integrity', () => {
  test('an older server copy never replaces a newer cached one', () => {
    const { store } = openOfflineStore(openNodeSqliteDatabase());
    store.saveIncident({ ...ASSIGNED, version: 5, incident: { ...ASSIGNED.incident, status: 'in_progress' } });
    store.saveIncident(ASSIGNED);
    expect(store.incident('campus-inc-001')).toMatchObject({ version: 5, incident: { status: 'in_progress' } });
  });

  test('only confirm removes an operation; a problem keeps it until an explicit decision', () => {
    const { store } = openOfflineStore(openNodeSqliteDatabase());
    const work = createOfflineWork({ store, actor: technician, clock });
    work.cache({ kind: 'available', incident: ASSIGNED.incident, version: 2 });
    const start = work.startWork('campus-inc-001');
    const note = work.addNote('campus-inc-001', 'Nota ficticia');
    const startId = start.ok ? start.operationId : '';
    const noteId = note.ok ? note.operationId : '';

    store.markProblem(startId, { kind: 'conflict', reason: 'assignment_changed', fields: ['work'], remoteVersion: null });
    expect(store.pending().map((operation) => operation.state)).toEqual(['conflict', 'pending']);
    expect(work.retry(startId)).toBe(true);
    expect(store.pending()[0]).toMatchObject({ state: 'pending', problem: null });

    store.confirm(noteId, { ...ASSIGNED, version: 3, incident: { ...ASSIGNED.incident, status: 'in_progress' } });
    expect(store.pending().map((operation) => operation.operationId)).toEqual([startId]);
    expect(store.incident('campus-inc-001')?.version).toBe(3);

    expect(work.discard(startId)).toBe(true);
    expect(store.pending()).toEqual([]);
  });

  test('a row that cannot be read back is kept in the table and out of the sync', () => {
    const db = openNodeSqliteDatabase();
    const { store } = openOfflineStore(db);
    store.saveIncident(ASSIGNED);
    createOfflineWork({ store, actor: technician, clock }).addNote('campus-inc-001', 'Nota ficticia');
    db.run("UPDATE pending_operations SET content_json = '{not json'");
    expect(store.pending()).toEqual([]);
    expect(db.all('SELECT count(*) AS n FROM pending_operations')[0]?.n).toBe(1);
  });
});
