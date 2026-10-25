import type { SyncReport } from '../application/syncEngine';
import type { PendingOperation } from '../domain/offlineQueue';

/** Spanish wording for queued offline work, shared by the detail screen and the pending changes panel. */

export function operationDescription(operation: PendingOperation): string {
  switch (operation.content.action) {
    case 'start':
      return 'Inicio de atención';
    case 'resolve':
      return `Resolución: ${operation.content.diagnosis}`;
    case 'comment':
      return `Nota: ${operation.content.text}`;
    case 'add_evidence':
      return `Referencia de foto ${operation.content.evidenceId} (pendiente de subir)`;
  }
}

export function operationState(operation: PendingOperation): string {
  switch (operation.state) {
    case 'pending':
      return 'pendiente';
    case 'conflict':
      return 'en conflicto';
    case 'rejected':
      return 'rechazado; requiere una decisión';
  }
}

/** Why a change was not sent, or null while it is simply pending. */
export function problemExplanation(operation: PendingOperation): string | null {
  if (operation.state === 'pending') {
    return null;
  }
  if (operation.problem?.kind === 'conflict') {
    return operation.problem.reason === 'assignment_changed'
      ? 'La incidencia fue reasignada y este cambio no se envió. Debes decidir qué hacer.'
      : 'La incidencia cambió en el servidor y este cambio no se envió. Debes decidir qué hacer.';
  }
  return 'El servidor rechazó este cambio y no se aplicó. Debes decidir qué hacer.';
}

function stopReason(report: SyncReport): string {
  switch (report.stoppedBy) {
    case null:
      return 'ninguna';
    case 'network':
      return 'sin conexión';
    case 'timeout':
      return 'el servidor tardó demasiado';
    case 'server_error':
      return 'error del servidor';
    case 'rate_limited':
      return 'demasiadas solicitudes';
    case 'unauthorized':
      return 'la sesión no es válida';
    case 'invalid_response':
      return 'respuesta inválida del servidor';
    case 'forbidden':
    case 'not_found':
    case 'rejected':
      return 'rechazo del servidor';
  }
}

export function syncSummary(report: SyncReport): string {
  return `Confirmados: ${String(report.confirmed.length)}. Conflictos: ${String(report.conflicts.length)}. Pendientes: ${String(report.pending.length)}. Detención: ${stopReason(report)}.`;
}
