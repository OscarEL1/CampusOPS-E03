import { createIncidentAssignments, type IncidentAssignments } from '../campusops/application/incidentAssignments';
import { createIncidentActions, type IncidentActions } from '../campusops/application/incidentActions';
import { createIncidentQueries, type IncidentQueries } from '../campusops/application/incidentQueries';
import {
  createLocationCache,
  createLocationLookup,
  type LocationLookup,
} from '../campusops/application/locationLookup';
import { createOfflineWork, type OfflineWork } from '../campusops/application/offlineWork';
import { createSessionManager, type SessionManager } from '../campusops/application/sessionManager';
import { createSyncEngine, type SyncEngine } from '../campusops/application/syncEngine';
import {
  createRemoteIncidentQueries,
  type RemoteIncidentQueries,
} from '../campusops/application/remoteIncidentQueries';
import type { CampusActor } from '../campusops/domain/accessPolicy';
import type { GeocodingProvider } from '../campusops/domain/incidentLocation';
import { DEFAULT_RETRY_LIMITS, realSleep, type RetryOptions } from '../campusops/domain/retryPolicy';
import type { AuthApi, Clock } from '../campusops/domain/session';
import type { SessionStore } from '../campusops/domain/sessionStore';
import { InMemoryIncidentRepository } from '../campusops/infrastructure/inMemoryIncidentRepository';
import { openExpoSqliteDatabase } from '../campusops/infrastructure/local/expoSqliteDatabase';
import type { SchemaResult } from '../campusops/infrastructure/local/localSchema';
import type { SqlDatabase } from '../campusops/infrastructure/local/sqlDatabase';
import { openOfflineStore } from '../campusops/infrastructure/local/sqliteOfflineStore';
import {
  createCourseGeocodingProvider,
  createOpenMeteoGeocodingProvider,
} from '../campusops/infrastructure/remote/geocodingProviders';
import { createHttpAuthApi } from '../campusops/infrastructure/remote/httpAuthApi';
import { createHttpIncidentGateway, type FetchLike } from '../campusops/infrastructure/remote/httpIncidentGateway';
import { SecureSessionStore } from '../campusops/infrastructure/secureSessionStore';

const DEFAULT_COURSE_BACKEND_URL = 'http://127.0.0.1:4310';

/** Read here, not imported, so a test that mocks the health client stays isolated. */
function courseBackendUrl(): string {
  return process.env.EXPO_PUBLIC_COURSE_BACKEND_URL ?? DEFAULT_COURSE_BACKEND_URL;
}

const platformFetch: FetchLike = (url, init) => fetch(url, init);

const systemClock: Clock = { now: () => Date.now() };

export type CampusOpsApp = Readonly<{
  /** In-memory reads kept for the week 02 and week 03 controls and their tests. */
  queries: IncidentQueries;
  assignments: IncidentAssignments;
  sessionStore: SessionStore;
  /** Login, shared refresh and logout (week 06). The only source of tokens. */
  session: SessionManager;
  /**
   * Incident use cases for the signed-in actor. The gateway asks the session
   * for credentials on every request; the actor only scopes the client-side
   * access policy, the backend still decides.
   */
  remoteIncidentsFor(actor: CampusActor): RemoteIncidentQueries;
  incidentActionsFor(actor: CampusActor): IncidentActions;
  /**
   * Local data (week 08): the persistent queue and the sync, on the device's
   * SQLite file. Opened on first use, migrating the schema if needed; null when
   * local storage cannot be opened, so the online app keeps working.
   */
  local(): LocalData | null;
  /**
   * Location of an incident (week 09): cache, then the geocoding provider,
   * and the label the person writes whenever the provider cannot be used.
   */
  location: LocationLookup;
}>;

export type LocalData = Readonly<{
  schema: SchemaResult;
  offlineWorkFor(actor: CampusActor): OfflineWork;
  syncFor(actor: CampusActor): SyncEngine;
}>;

export type CampusOpsAppOptions = Readonly<{
  authApi?: AuthApi;
  fetchImpl?: FetchLike;
  clock?: Clock;
  baseUrl?: string;
  /** Local SQLite database; the device file by default. Tests pass their own. */
  database?: SqlDatabase;
  /** Retries of the incident client and the geocoding provider; the published limits by default. */
  retry?: RetryOptions;
  /** Geocoding provider; chosen by EXPO_PUBLIC_GEOCODING_PROVIDER by default. */
  geocodingProvider?: GeocodingProvider;
}>;

/** Public, not a secret: which geocoding service the build uses. `open-meteo` or the course double. */
function configuredGeocodingProvider(): string {
  return process.env.EXPO_PUBLIC_GEOCODING_PROVIDER ?? 'course-double';
}

export function createCampusOpsApp(
  sessionStore: SessionStore = new SecureSessionStore(),
  options: CampusOpsAppOptions = {},
): CampusOpsApp {
  const repository = new InMemoryIncidentRepository();
  const baseUrl = options.baseUrl ?? courseBackendUrl();
  const fetchImpl = options.fetchImpl ?? platformFetch;
  const clock = options.clock ?? systemClock;
  const session = createSessionManager({
    store: sessionStore,
    authApi: options.authApi ?? createHttpAuthApi({ baseUrl, fetchImpl }),
    clock,
  });
  let local: LocalData | null | undefined;
  const retry: RetryOptions = options.retry ?? { limits: DEFAULT_RETRY_LIMITS, sleep: realSleep };
  const gateway = createHttpIncidentGateway({ baseUrl, session, fetchImpl, retry });
  const geocodingProvider =
    options.geocodingProvider ??
    (configuredGeocodingProvider() === 'open-meteo'
      ? createOpenMeteoGeocodingProvider({ fetchImpl, retry })
      : createCourseGeocodingProvider({ baseUrl, session, fetchImpl, retry }));
  const location = createLocationLookup({ provider: geocodingProvider, cache: createLocationCache({ clock }), clock });
  return {
    queries: createIncidentQueries(repository),
    assignments: createIncidentAssignments(repository),
    sessionStore,
    session,
    remoteIncidentsFor: (actor) => createRemoteIncidentQueries(gateway, actor),
    incidentActionsFor: (actor) => createIncidentActions(gateway, actor),
    location,
    local() {
      if (local === undefined) {
        try {
          const opened = openOfflineStore(options.database ?? openExpoSqliteDatabase());
          local = {
            schema: opened.schema,
            offlineWorkFor: (actor) => createOfflineWork({ store: opened.store, actor, clock }),
            syncFor: (actor) => createSyncEngine({ store: opened.store, gateway, actor, clock }),
          };
        } catch {
          // A failed migration rolled back; the data is still in the previous
          // schema and the next start tries again.
          local = null;
        }
      }
      return local;
    },
  };
}
