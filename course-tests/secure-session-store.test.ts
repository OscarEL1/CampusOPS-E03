import * as SecureStore from 'expo-secure-store';

import { createCampusOpsApp } from '../src/app/composition';
import type { SessionStore, StoredSession } from '../src/campusops/domain/sessionStore';
import { SecureSessionStore } from '../src/campusops/infrastructure/secureSessionStore';

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const FICTIONAL_SESSION: StoredSession = {
  actorId: 'campus-reporter-demo-401',
  role: 'reporter',
  accessToken: 'fictional-token-for-storage-test',
  refreshToken: 'fictional-refresh-for-storage-test',
  expiresAt: 1_800_000_000_000,
  generation: 1,
};

const mockedSet = jest.mocked(SecureStore.setItemAsync);
const mockedGet = jest.mocked(SecureStore.getItemAsync);
const mockedDelete = jest.mocked(SecureStore.deleteItemAsync);

beforeEach(() => {
  jest.clearAllMocks();
});

test('saves, reads and clears a fictional session through SecureStore', async () => {
  mockedGet.mockResolvedValue(JSON.stringify(FICTIONAL_SESSION));
  const store = new SecureSessionStore();

  await store.save(FICTIONAL_SESSION);
  await expect(store.read()).resolves.toEqual(FICTIONAL_SESSION);
  await store.clear();

  expect(mockedSet).toHaveBeenCalledWith(
    'campusops.session.v1',
    JSON.stringify(FICTIONAL_SESSION),
    { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY },
  );
  expect(mockedDelete).toHaveBeenCalledWith('campusops.session.v1', {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
});

test('rejects and removes a malformed stored value without exposing it', async () => {
  mockedGet.mockResolvedValue('{not-valid-json');
  const store = new SecureSessionStore();

  await expect(store.read()).resolves.toBeNull();
  expect(mockedDelete).toHaveBeenCalledTimes(1);
});

test('composition accepts an in-memory substitute without calling the native module', () => {
  let session: StoredSession | null = null;
  const inMemoryStore: SessionStore = {
    async save(value) {
      session = value;
    },
    async read() {
      return session;
    },
    async clear() {
      session = null;
    },
  };

  const app = createCampusOpsApp(inMemoryStore);

  expect(app.sessionStore).toBe(inMemoryStore);
  expect(mockedSet).not.toHaveBeenCalled();
  expect(mockedGet).not.toHaveBeenCalled();
});
