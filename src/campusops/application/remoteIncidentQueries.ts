import { canViewIncident, type CampusActor } from '../domain/accessPolicy';
import type {
  CreatedIncident,
  IncidentGateway,
  NewIncident,
  RemoteIncident,
  RemoteResult,
} from '../domain/incidentGateway';

export type RemoteIncidentQueries = Readonly<{
  list(): Promise<RemoteResult<readonly RemoteIncident[]>>;
  get(id: string): Promise<RemoteResult<RemoteIncident>>;
  /**
   * The caller supplies the key and keeps it for the life of one draft, so a
   * retry after a timeout reuses it and the server replays instead of creating
   * a second incident. A new key per call would defeat that.
   */
  create(input: NewIncident, idempotencyKey: string): Promise<RemoteResult<CreatedIncident>>;
}>;

/**
 * A key for one creation intent. It must be unique, not secret: it identifies
 * an operation to the server and carries no authority.
 */
export function newIdempotencyKey(): string {
  return `campusops-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function createRemoteIncidentQueries(gateway: IncidentGateway, actor: CampusActor): RemoteIncidentQueries {
  return {
    async list() {
      const result = await gateway.list();
      if (!result.ok) {
        return result;
      }
      // The server decides what this actor may see. The client applies the
      // same policy again as defence in depth, so a server mistake does not
      // become a screen showing another member's incident. A withheld item has
      // no owner data to check and is shown only as id and status.
      const visible = result.value.filter(
        (item) => item.kind === 'withheld' || canViewIncident(actor, item.incident),
      );
      return { ok: true, value: visible };
    },

    async get(id) {
      const result = await gateway.get(id);
      if (result.ok && result.value.kind === 'available' && !canViewIncident(actor, result.value.incident)) {
        // Answers like a missing id, as the week 03 policy does, so the
        // response does not confirm that someone else's incident exists.
        return { ok: false, failure: { kind: 'not_found' } };
      }
      return result;
    },

    create(input, idempotencyKey) {
      return gateway.create(input, idempotencyKey);
    },
  };
}
