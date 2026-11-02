import { render, userEvent, waitFor } from '@testing-library/react-native';

import type { LocationLookup } from '../src/campusops/application/locationLookup';
import type { RemoteIncidentQueries } from '../src/campusops/application/remoteIncidentQueries';
import { CreateIncidentScreen } from '../src/campusops/ui/CreateIncidentScreen';

function createFake() {
  return jest.fn<ReturnType<RemoteIncidentQueries['create']>, Parameters<RemoteIncidentQueries['create']>>();
}

async function completeRequiredFields(view: Awaited<ReturnType<typeof render>>) {
  const user = userEvent.setup();
  await user.press(view.getByTestId('incident-category-water'));
  await user.type(view.getByTestId('incident-description'), 'Fuga ficticia en zona de prueba');
  return user;
}

test('shows a provider result and creates the incident with its label', async () => {
  const lookup = jest.fn<ReturnType<LocationLookup['lookup']>, Parameters<LocationLookup['lookup']>>().mockResolvedValue({
    kind: 'resolved',
    location: { source: 'provider', label: 'Puebla de prueba', latitude: 19.04, longitude: -98.2 },
    origin: 'provider',
    fallbackReason: null,
  });
  const create = createFake().mockResolvedValue({
    ok: true,
    value: {
      duplicate: false,
      incident: { kind: 'withheld', summary: { id: 'campus-inc-location-1', version: 1, status: 'open' } },
    },
  });
  const view = await render(<CreateIncidentScreen create={create} lookup={lookup} />);
  const user = await completeRequiredFields(view);

  await user.type(view.getByTestId('incident-location-query'), 'Puebla');
  await user.press(view.getByTestId('incident-location-search'));

  await waitFor(() => expect(view.getByText('Ubicación encontrada')).toBeTruthy());
  expect(view.getByText('Puebla de prueba')).toBeTruthy();
  expect(view.getByTestId('incident-location-coordinates')).toBeTruthy();
  await user.press(view.getByTestId('create-incident-submit'));
  await waitFor(() =>
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ location: 'Puebla de prueba' }), expect.any(String)),
  );
});

test('keeps the manual label after a timeout and never shows coordinates', async () => {
  const lookup = jest.fn<ReturnType<LocationLookup['lookup']>, Parameters<LocationLookup['lookup']>>().mockResolvedValue({
    kind: 'resolved',
    location: { source: 'manual', label: 'Edificio X, acceso norte' },
    origin: 'manual',
    fallbackReason: 'timeout',
  });
  const view = await render(<CreateIncidentScreen create={createFake()} lookup={lookup} />);
  const user = userEvent.setup();

  await user.type(view.getByTestId('incident-location-query'), 'Edificio X');
  await user.type(view.getByTestId('incident-location'), 'Edificio X, acceso norte');
  await user.press(view.getByTestId('incident-location-search'));

  await waitFor(() =>
    expect(view.getByText('No se pudo usar el servicio de ubicación; se usará lo que escribiste')).toBeTruthy(),
  );
  expect(view.getByText('Motivo: el servicio tardó demasiado en responder.')).toBeTruthy();
  expect(view.queryByTestId('incident-location-coordinates')).toBeNull();
});

test('manual_required asks for a location and does not create without one', async () => {
  const lookup = jest.fn<ReturnType<LocationLookup['lookup']>, Parameters<LocationLookup['lookup']>>().mockResolvedValue({
    kind: 'manual_required',
    fallbackReason: 'network',
  });
  const create = createFake();
  const view = await render(<CreateIncidentScreen create={create} lookup={lookup} />);
  const user = await completeRequiredFields(view);

  await user.type(view.getByTestId('incident-location-query'), 'Zona sin conexión');
  await user.press(view.getByTestId('incident-location-search'));
  await waitFor(() => expect(view.getByTestId('incident-location-manual-required')).toBeTruthy());
  expect(view.getByText(/Escribe el edificio, zona o referencia/)).toBeTruthy();

  await user.press(view.getByTestId('create-incident-submit'));
  expect(create).not.toHaveBeenCalled();
  expect(view.getByTestId('create-incident-error')).toBeTruthy();
});
