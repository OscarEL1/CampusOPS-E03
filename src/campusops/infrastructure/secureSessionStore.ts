import * as SecureStore from 'expo-secure-store';

import type { SessionStore, StoredSession } from '../domain/sessionStore';

const SESSION_KEY = 'campusops.session.v1';
const STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

function isStoredSession(value: unknown): value is StoredSession {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.actorId === 'string' &&
    candidate.actorId.length > 0 &&
    (candidate.role === 'reporter' || candidate.role === 'technician' || candidate.role === 'coordinator') &&
    typeof candidate.accessToken === 'string' &&
    candidate.accessToken.length > 0 &&
    typeof candidate.refreshToken === 'string' &&
    candidate.refreshToken.length > 0 &&
    typeof candidate.expiresAt === 'number' &&
    Number.isFinite(candidate.expiresAt) &&
    typeof candidate.generation === 'number' &&
    Number.isInteger(candidate.generation) &&
    candidate.generation >= 0
  );
}

/**
 * Persists the authenticated session in the platform keychain/keystore. A value
 * saved by an earlier shape (week 04 had no refresh token) fails validation and
 * is deleted, so it can never become a session.
 */
export class SecureSessionStore implements SessionStore {
  async save(session: StoredSession): Promise<void> {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session), STORE_OPTIONS);
  }

  async read(): Promise<StoredSession | null> {
    const encoded = await SecureStore.getItemAsync(SESSION_KEY, STORE_OPTIONS);
    if (encoded === null) {
      return null;
    }

    try {
      const parsed: unknown = JSON.parse(encoded);
      if (isStoredSession(parsed)) {
        return parsed;
      }
    } catch {
      // A malformed value must never become an authenticated session.
    }

    await this.clear();
    return null;
  }

  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(SESSION_KEY, STORE_OPTIONS);
  }
}
