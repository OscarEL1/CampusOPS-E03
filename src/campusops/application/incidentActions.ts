import {
  canCloseOrReopenIncident,
  canResolveIncident,
  type CampusActor,
} from '../domain/accessPolicy';
import type { Incident } from '../domain/incident';
import type {
  ActedIncident,
  IncidentAction,
  IncidentActionInput,
  IncidentGateway,
  RemoteResult,
} from '../domain/incidentGateway';

export type IncidentActions = Readonly<{
  act(
    incident: Incident,
    action: IncidentAction,
    input: IncidentActionInput,
    baseVersion: number,
    idempotencyKey: string,
  ): Promise<RemoteResult<ActedIncident>>;
}>;

/** Applies client-side authorization before any remote side effect. */
export function createIncidentActions(gateway: IncidentGateway, actor: CampusActor): IncidentActions {
  return {
    act(incident, action, input, baseVersion, idempotencyKey) {
      const allowed =
        action === 'start' || action === 'resolve'
          ? canResolveIncident(actor, incident)
          : canCloseOrReopenIncident(actor);
      if (!allowed) {
        return Promise.resolve({ ok: false, failure: { kind: 'forbidden' } });
      }
      return gateway.act(incident.id, action, input, baseVersion, idempotencyKey);
    },
  };
}
