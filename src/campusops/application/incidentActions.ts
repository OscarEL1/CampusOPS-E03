import {
  canAssignIncident,
  canCloseOrReopenIncident,
  canResolveIncident,
  canViewIncident,
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

function isAllowed(actor: CampusActor, incident: Incident, action: IncidentAction): boolean {
  switch (action) {
    case 'start':
    case 'resolve':
      return canResolveIncident(actor, incident);
    case 'close':
    case 'reopen':
      return canCloseOrReopenIncident(actor);
    case 'assign':
    case 'prioritize':
      return canAssignIncident(actor);
    case 'comment':
    case 'add_evidence':
      return canViewIncident(actor, incident);
    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }
}

/** Applies client-side authorization before any remote side effect. */
export function createIncidentActions(gateway: IncidentGateway, actor: CampusActor): IncidentActions {
  return {
    act(incident, action, input, baseVersion, idempotencyKey) {
      if (!isAllowed(actor, incident, action)) {
        return Promise.resolve({ ok: false, failure: { kind: 'forbidden' } });
      }
      return gateway.act(incident.id, action, input, baseVersion, idempotencyKey);
    },
  };
}
