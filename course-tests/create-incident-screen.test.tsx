import { render, userEvent, waitFor } from '@testing-library/react-native';

import type { RemoteIncidentQueries } from '../src/campusops/application/remoteIncidentQueries';
import { CreateIncidentScreen } from '../src/campusops/ui/CreateIncidentScreen';

test('a retry for the same draft reuses its idempotency key', async () => {
  const create = jest
    .fn<ReturnType<RemoteIncidentQueries['create']>, Parameters<RemoteIncidentQueries['create']>>()
    .mockResolvedValueOnce({ ok: false, failure: { kind: 'timeout', timeoutMs: 8000 } })
    .mockResolvedValueOnce({
      ok: true,
      value: {
        duplicate: true,
        incident: { kind: 'withheld', summary: { id: 'campus-inc-101', version: 1, status: 'open' } },
      },
    });
  const view = await render(<CreateIncidentScreen create={create} />);
  const user = userEvent.setup();

  await user.press(view.getByTestId('incident-category-water'));
  await user.type(view.getByTestId('incident-description'), 'Fuga ficticia en un lavabo');
  await user.type(view.getByTestId('incident-location'), 'Edificio de prueba, planta baja');
  await user.press(view.getByTestId('create-incident-submit'));

  await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(view.getByTestId('create-incident-error')).toBeTruthy());
  await user.press(view.getByTestId('create-incident-submit'));

  await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
  expect(create.mock.calls[1]?.[1]).toBe(create.mock.calls[0]?.[1]);
  expect(view.getByTestId('create-incident-success').props.children).toBe('Esta incidencia ya estaba registrada.');
});

test('does not call create while required fields are missing', async () => {
  const create = jest.fn<ReturnType<RemoteIncidentQueries['create']>, Parameters<RemoteIncidentQueries['create']>>();
  const view = await render(<CreateIncidentScreen create={create} />);

  await userEvent.press(view.getByTestId('create-incident-submit'));

  expect(create).not.toHaveBeenCalled();
  expect(view.getByTestId('create-incident-error')).toBeTruthy();
});
