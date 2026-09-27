/**
 * Access configuration for the course backend.
 *
 * The secret is read from the environment only. There is no in-repository
 * fallback on purpose: a missing value fails loudly instead of shipping a
 * credential inside the bundle and the git history.
 *
 * This variable deliberately has no EXPO_PUBLIC_ prefix. Expo embeds variables
 * with that prefix in the client bundle, which would publish the credential to
 * every installed copy. CAMPUSOPS_API_SECRET is therefore available only to
 * backend tooling and tests; a client build receives no secret and fails closed.
 */

/** Pure validation, so the rule can be tested without touching the process. */
export function readBackendApiSecret(rawValue: string | undefined): string {
  if (rawValue === undefined || rawValue.trim() === '') {
    throw new Error('Missing backend API secret; copy .env.example to .env and set it locally');
  }
  return rawValue;
}

export function getBackendApiSecret(): string {
  return readBackendApiSecret(process.env.CAMPUSOPS_API_SECRET);
}
