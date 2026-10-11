import { createIncidentActions } from '../src/campusops/application/incidentActions';
import type { Incident } from '../src/campusops/domain/incident';
import type { IncidentGateway } from '../src/campusops/domain/incidentGateway';

const incident: Incident = {
  id: 'incident-fixture-1',
  title: 'Incidencia ficticia',
  category: 'connectivity',
  description: 'DescripciÃ³n ficticia',
  location: 'Edificio de prueba',
  status: 'in_progress',
  reporterId: 'reporter-1',
  assignedTechnicianId: 'technician-1',
};

function gatewayWith(act: IncidentGateway['act']): IncidentGateway {
  return {
    list: async () => ({ ok: true, value: [] }),
    get: async () => ({ ok: false, failure: { kind: 'not_found' } }),
    create: async () => ({ ok: false, failure: { kind: 'forbidden' } }),
    act,
  };
}

test('denies an unassigned technician before making a gateway request', async () => {
  const remoteAct = jest.fn<ReturnType<IncidentGateway['act']>, Parameters<IncidentGateway['act']>>();
  const actions = createIncidentActions(gatewayWith(remoteAct), {
    id: 'technician-2',
    role: 'technician',
  });

  await expect(actions.act(incident, 'resolve', { diagnosis: 'DiagnÃ³stico ficticio' }, 2, 'denied-operation')).resolves.toEqual({
    ok: false,
    failure: { kind: 'forbidden' },
  });
  expect(remoteAct).not.toHaveBeenCalled();
});

test('forwards an authorized technician action with its version and idempotency key', async () => {
  const updated = { ...incident, status: 'resolved' as const };
  const remoteAct = jest.fn<ReturnType<IncidentGateway['act']>, Parameters<IncidentGateway['act']>>().mockResolvedValue({
    ok: true,
    value: { incident: { kind: 'available', incident: updated, version: 3 }, duplicate: false },
  });
  const actions = createIncidentActions(gatewayWith(remoteAct), {
    id: 'technician-1',
    role: 'technician',
  });

  await expect(
    actions.act(incident, 'resolve', { diagnosis: 'DiagnÃ³stico ficticio' }, 2, 'resolve-operation'),
  ).resolves.toMatchObject({ ok: true });
  expect(remoteAct).toHaveBeenCalledWith(
    'incident-fixture-1',
    'resolve',
    { diagnosis: 'DiagnÃ³stico ficticio' },
    2,
    'resolve-operation',
  );
});
