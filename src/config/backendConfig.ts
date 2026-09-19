/**
 * Access configuration for the course backend.
 *
 * The fallback below keeps the app working on a machine that has no
 * environment file configured yet.
 */
const EXPO_PUBLIC_API_SECRET = 'campus-demo-6f2a41d9e07b4c58';

export function getBackendApiSecret(): string {
  return process.env.EXPO_PUBLIC_API_SECRET ?? EXPO_PUBLIC_API_SECRET;
}
