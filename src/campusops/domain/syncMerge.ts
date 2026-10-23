import type { Incident } from './incident';

/**
 * Three-way reconciliation of a CampusOps record (week 08).
 *
 * `base` is the copy both sides started from, `local` carries the pending
 * offline intention and `remote` is what the server holds now. A field that
 * only one side changed is taken from that side; a field both sides changed to
 * different content is a conflict. Content is compared as canonical JSON, so
 * key order and object identity never decide anything. Inputs are never
 * mutated and the result never aliases them.
 */

export type SyncFields = Readonly<Record<string, unknown>>;

export type SyncRecord = Readonly<{ id: string; version: number; fields: SyncFields }>;

export type SyncResolution =
  | Readonly<{ kind: 'merged'; fields: SyncFields }>
  | Readonly<{ kind: 'conflict'; fields: readonly string[] }>;

/** JSON text with object keys sorted at every level. `undefined` (an absent field) has its own marker. */
export function canonicalJson(value: unknown): string {
  const text = JSON.stringify(value, (_key, item: unknown) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      return item;
    }
    const source = item as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(source)
        .sort()
        .map((key) => [key, source[key]]),
    );
  });
  return text ?? '<absent>';
}

function sameContent(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function copyJson(value: unknown): unknown {
  return value === undefined ? undefined : (JSON.parse(JSON.stringify(value)) as unknown);
}

export function resolveSync(base: SyncRecord, local: SyncRecord, remote: SyncRecord): SyncResolution {
  const names = [
    ...new Set([...Object.keys(base.fields), ...Object.keys(local.fields), ...Object.keys(remote.fields)]),
  ].sort();
  const conflicts: string[] = [];
  const merged: Record<string, unknown> = {};
  for (const name of names) {
    const baseValue = base.fields[name];
    const localValue = local.fields[name];
    const remoteValue = remote.fields[name];
    const localChanged = !sameContent(baseValue, localValue);
    const remoteChanged = !sameContent(baseValue, remoteValue);
    if (localChanged && remoteChanged && !sameContent(localValue, remoteValue)) {
      conflicts.push(name);
      continue;
    }
    const chosen = copyJson(localChanged ? localValue : remoteValue);
    if (chosen !== undefined) {
      merged[name] = chosen;
    }
  }
  return conflicts.length > 0 ? { kind: 'conflict', fields: conflicts } : { kind: 'merged', fields: merged };
}

/** Keeps the first operation of each operationId, in order, without touching the input list. */
export function deduplicateOperations<T extends Readonly<{ operationId: string }>>(operations: readonly T[]): readonly T[] {
  const seen = new Set<string>();
  return operations.filter((operation) => {
    if (seen.has(operation.operationId)) {
      return false;
    }
    seen.add(operation.operationId);
    return true;
  });
}

/**
 * The fields CampusOps reconciles for an incident. `work` groups the assigned
 * technician and the status because they change together: a remote
 * reassignment and a local start of work touch the same field and conflict.
 */
export function syncFieldsOf(incident: Pick<Incident, 'assignedTechnicianId' | 'status'>): SyncFields {
  return { work: { assignedTechnicianId: incident.assignedTechnicianId, status: incident.status } };
}
