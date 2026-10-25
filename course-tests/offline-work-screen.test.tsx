import { render, userEvent, waitFor } from '@testing-library/react-native';

import type { OfflineWork } from '../src/campusops/application/offlineWork';
import type { SyncEngine } from '../src/campusops/application/syncEngine';
import type { CampusActor } from '../src/campusops/domain/accessPolicy';
import type { Incident } from '../src/campusops/domain/incident';
import type { LocalIncidentView, PendingOperation } from '../src/campusops/domain/offlineQueue';
import { IncidentDetailScreen } from '../src/campusops/ui/IncidentDetailScreen';

const incident: Incident = {
  id: 'incident-offline-ui-1',
  title: 'Incidencia ficticia sin conexión',
  category: 'connectivity',
  description: 'Caso ficticio para probar la cola local.',
  location: 'Edificio de prueba',
  status: 'assigned',
  reporterId: 'reporter-1',
  assignedTechnicianId: 'technician-1',
};

const assignedTechnician: CampusActor = { id: 'technician-1', role: 'technician' };

const conflictingStart: PendingOperation = {
  operationId: 'offline-operation-0001',
  incidentId: incident.id,
  actorId: assignedTechnician.id,
  content: { action: 'start' },
  baseVersion: 2,
  baseFields: { work: { assignedTechnicianId: assignedTechnician.id, status: 'assigned' } },
  createdAt: 1,
  attempts: 1,
  state: 'conflict',
  problem: { kind: 'conflict', reason: 'assignment_changed', fields: ['work'], remoteVersion: null },
};

function localView(operations: readonly PendingOperation[]): LocalIncidentView {
  return {
    snapshot: { incident, version: 2, cachedAt: 1 },
    localStatus: 'assigned',
    operations,
    hasConflict: operations.some((operation) => operation.state === 'conflict'),
  };
}

function fakeOfflineWork(operations: readonly PendingOperation[], discard = jest.fn(() => true)): OfflineWork {
  return {
    cache: jest.fn(),
    startWork: jest.fn(() => ({ ok: true, operationId: 'offline-start-0001', duplicate: false })),
    resolve: jest.fn(() => ({ ok: true, operationId: 'offline-resolve-0001', duplicate: false })),
    addNote: jest.fn(() => ({ ok: true, operationId: 'offline-note-0001', duplicate: false })),
    addPhotoReference: jest.fn(() => ({ ok: true, operationId: 'offline-photo-0001', duplicate: false })),
    pending: jest.fn(() => operations),
    view: jest.fn(() => localView(operations)),
    retry: jest.fn(() => true),
    discard,
  };
}

const sync: SyncEngine = {
  sync: jest.fn(async () => ({
    confirmed: [],
    replayed: [],
    rebased: [],
    conflicts: [],
    rejected: [],
    held: [],
    pending: [],
    stoppedBy: null,
  })),
};

function renderScreen(actor: CampusActor, offlineWork: OfflineWork) {
  return render(
    <IncidentDetailScreen
      act={jest.fn()}
      actor={actor}
      incident={incident}
      offlineWork={offlineWork}
      onBack={jest.fn()}
      onChanged={jest.fn()}
      sync={sync}
      version={2}
    />,
  );
}

test('shows a reassignment conflict and keeps it until the technician explicitly discards it', async () => {
  const discard = jest.fn(() => true);
  const offlineWork = fakeOfflineWork([conflictingStart], discard);
  const view = await renderScreen(assignedTechnician, offlineWork);

  await waitFor(() => expect(view.getByText(/La incidencia fue reasignada/)).toBeTruthy());
  expect(view.getByText(/este cambio no se envió/)).toBeTruthy();
  expect(discard).not.toHaveBeenCalled();

  await userEvent.press(view.getByText('Descartar mi cambio'));

  expect(discard).toHaveBeenCalledTimes(1);
  expect(discard).toHaveBeenCalledWith(conflictingStart.operationId);
});

test('does not offer offline start to a technician who is not assigned', async () => {
  const offlineWork = fakeOfflineWork([]);
  const view = await renderScreen({ id: 'technician-2', role: 'technician' }, offlineWork);

  expect(view.queryByText('Iniciar sin conexión')).toBeNull();
  expect(view.queryByTestId('offline-work-panel')).toBeNull();
  expect(offlineWork.startWork).not.toHaveBeenCalled();
});

test('labels a queued photo reference as pending upload', async () => {
  const photo: PendingOperation = {
    ...conflictingStart,
    operationId: 'offline-operation-0002',
    content: { action: 'add_evidence', evidenceId: 'photo-ref-ficticia-0001' },
    attempts: 0,
    state: 'pending',
    problem: null,
  };
  const view = await renderScreen(assignedTechnician, fakeOfflineWork([photo]));

  await waitFor(() => expect(view.getByText(/pendiente de subir/)).toBeTruthy());
});
