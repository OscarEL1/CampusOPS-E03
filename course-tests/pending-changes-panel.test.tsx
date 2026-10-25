import { render, userEvent, waitFor } from '@testing-library/react-native';

import type { OfflineWork } from '../src/campusops/application/offlineWork';
import type { SyncEngine, SyncReport } from '../src/campusops/application/syncEngine';
import type { PendingOperation } from '../src/campusops/domain/offlineQueue';
import { PendingChangesPanel } from '../src/campusops/ui/PendingChangesPanel';

/**
 * Week 08: pending work stays visible on the main screen even when the online
 * list cannot show its incident (offline after a restart, or the incident was
 * reassigned away). Fictional data only.
 */

const conflict: PendingOperation = {
  operationId: 'pending-panel-op-0001',
  incidentId: 'campus-inc-201',
  actorId: 'technician-1',
  content: { action: 'start' },
  baseVersion: 2,
  baseFields: { work: { assignedTechnicianId: 'technician-1', status: 'assigned' } },
  createdAt: 1,
  attempts: 1,
  state: 'conflict',
  problem: { kind: 'conflict', reason: 'assignment_changed', fields: ['work'], remoteVersion: null },
};

const note: PendingOperation = {
  ...conflict,
  operationId: 'pending-panel-op-0002',
  content: { action: 'comment', text: 'Nota ficticia guardada sin conexión' },
  attempts: 0,
  state: 'pending',
  problem: null,
};

function fakeOfflineWork(initial: readonly PendingOperation[]) {
  let operations = [...initial];
  const work: OfflineWork = {
    cache: jest.fn(),
    startWork: jest.fn(),
    resolve: jest.fn(),
    addNote: jest.fn(),
    addPhotoReference: jest.fn(),
    pending: jest.fn(() => operations),
    view: jest.fn(() => ({
      snapshot: {
        incident: {
          id: 'campus-inc-201',
          title: 'Incidencia de conectividad',
          category: 'connectivity',
          description: 'Red ficticia caída',
          location: 'Laboratorio de prueba',
          status: 'assigned',
          reporterId: 'reporter-1',
          assignedTechnicianId: 'technician-1',
        },
        version: 2,
        cachedAt: 1,
      },
      localStatus: 'assigned',
      operations,
      hasConflict: true,
    })),
    retry: jest.fn(() => true),
    discard: jest.fn((operationId: string) => {
      operations = operations.filter((operation) => operation.operationId !== operationId);
      return true;
    }),
  };
  return work;
}

function syncReturning(report: Partial<SyncReport>): SyncEngine {
  return {
    sync: jest.fn(async () => ({
      confirmed: [],
      replayed: [],
      rebased: [],
      conflicts: [],
      rejected: [],
      held: [],
      pending: [],
      stoppedBy: null,
      ...report,
    })),
  };
}

test('shows a conflict for an incident the list no longer has and keeps it until an explicit decision', async () => {
  const work = fakeOfflineWork([conflict, note]);
  const view = await render(<PendingChangesPanel offlineWork={work} sync={syncReturning({})} />);

  // Both changes belong to the same incident, each labelled with it.
  expect(view.getAllByText('Incidencia de conectividad · campus-inc-201')).toHaveLength(2);
  expect(view.getByText(/La incidencia fue reasignada y este cambio no se envió/)).toBeTruthy();
  expect(view.getByText('Nota: Nota ficticia guardada sin conexión')).toBeTruthy();
  expect(view.queryByTestId(`pending-discard-${note.operationId}`)).toBeNull();
  expect(work.discard).not.toHaveBeenCalled();

  await userEvent.press(view.getByTestId(`pending-retry-${conflict.operationId}`));
  expect(work.retry).toHaveBeenCalledWith(conflict.operationId);
  expect(work.discard).not.toHaveBeenCalled();

  await userEvent.press(view.getByTestId(`pending-discard-${conflict.operationId}`));
  expect(work.discard).toHaveBeenCalledWith(conflict.operationId);
  await waitFor(() => expect(view.queryByTestId(`pending-change-${conflict.operationId}`)).toBeNull());
  expect(view.getByTestId(`pending-change-${note.operationId}`)).toBeTruthy();
});

test('syncing reports what happened, in Spanish, and lets the caller reload', async () => {
  const onSynced = jest.fn();
  const sync = syncReturning({ pending: [note.operationId], stoppedBy: 'network' });
  const view = await render(<PendingChangesPanel offlineWork={fakeOfflineWork([note])} onSynced={onSynced} sync={sync} />);

  await userEvent.press(view.getByTestId('pending-sync'));

  await waitFor(() =>
    expect(view.getByTestId('pending-message').props.children).toBe(
      'Confirmados: 0. Conflictos: 0. Pendientes: 1. Detención: sin conexión.',
    ),
  );
  expect(sync.sync).toHaveBeenCalledTimes(1);
  expect(onSynced).toHaveBeenCalledTimes(1);
});

test('renders nothing while the queue is empty', async () => {
  const view = await render(<PendingChangesPanel offlineWork={fakeOfflineWork([])} sync={syncReturning({})} />);
  expect(view.queryByTestId('pending-changes-panel')).toBeNull();
});
