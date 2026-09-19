import type { CampusRole } from '../contracts';
import type { CampusActor } from '../domain/accessPolicy';
import type { Incident } from '../domain/incident';
import { redactIncidentForLog, type IncidentLogFields } from '../domain/logRedaction';

export type IncidentLogEntry = Readonly<{
  event: string;
  /** The role is kept for auditing; the actor id identifies a person and is not. */
  actorRole: CampusRole;
  incident: IncidentLogFields;
}>;

export type LogSink = (entry: IncidentLogEntry) => void;

/**
 * Single entry point for incident logging. Callers cannot hand a raw incident
 * to a sink, because the entry is assembled from the redacted projection.
 */
export function logIncidentEvent(
  sink: LogSink,
  event: string,
  actor: CampusActor,
  incident: Incident,
): void {
  sink({
    event,
    actorRole: actor.role,
    incident: redactIncidentForLog(incident),
  });
}
