/**
 * Access configuration for the course backend.
 *
 * The secret is read from the environment only. There is no in-repository
 * fallback on purpose: a missing value fails loudly instead of shipping a
 * credential inside the bundle and the git history. The expected variable
 * name is documented in .env.example, which carries the name without a value.
 */

/** Pure validation, so the rule can be tested without touching the process. */
export function readBackendApiSecret(rawValue: string | undefined): string {
  if (rawValue === undefined || rawValue.trim() === '') {
    throw new Error('Missing backend API secret; copy .env.example to .env and set it locally');
  }
  return rawValue;
}

export function getBackendApiSecret(): string {
  return readBackendApiSecret(process.env.EXPO_PUBLIC_API_SECRET);
}
