/**
 * Access configuration for the course backend.
 *
 * The secret is read from the environment only. There is no in-repository
 * fallback on purpose: a missing value fails loudly instead of shipping a
 * credential inside the bundle and the git history.
 *
 * The variable is deliberately NOT named with the EXPO_PUBLIC_ prefix. Expo
 * replaces every EXPO_PUBLIC_ variable at build time, so its value is embedded
 * verbatim in the client bundle that reaches every device; a credential under
 * that prefix is published, not configured. Reading CAMPUSOPS_API_SECRET keeps
 * the value out of the client bundle: in a client build it resolves to
 * undefined and this module throws instead of shipping anything. The accessor
 * is therefore for non-client contexts such as node tooling and tests.
 *
 * course-tests/env-exposure.test.ts fails if a credential name comes back under
 * the public prefix.
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
