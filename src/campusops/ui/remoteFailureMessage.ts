import type { RemoteFailure } from '../domain/incidentGateway';

/**
 * What a person sees for each failure kind. Every kind gets its own sentence,
 * so a timeout is not reported as "no connection" and a malformed response is
 * not reported as "nothing here". No status code, reason or server text is
 * shown: those belong in the technical record, not on the screen.
 */
export function describeRemoteFailure(failure: RemoteFailure): string {
  switch (failure.kind) {
    case 'timeout':
      return 'El servidor tardó demasiado en responder. Intenta de nuevo.';
    case 'network':
      return 'No hay conexión con el servidor de CampusOps.';
    case 'server_error':
      return 'El servidor tuvo un error. Intenta más tarde.';
    case 'rate_limited':
      return failure.retryAfterMs === null
        ? 'Demasiadas solicitudes. Espera un momento antes de reintentar.'
        : `Demasiadas solicitudes. Espera ${Math.ceil(failure.retryAfterMs / 1000)} s antes de reintentar.`;
    case 'unauthorized':
      return 'Tu sesión no es válida. Vuelve a iniciar sesión.';
    case 'forbidden':
      return 'No tienes permiso para ver esta información.';
    case 'not_found':
      return 'La incidencia no existe o no está disponible.';
    case 'rejected':
      return 'El servidor rechazó la solicitud.';
    case 'invalid_response':
      return 'El servidor respondió con datos que no se pueden usar.';
    default: {
      const unhandled: never = failure;
      return unhandled;
    }
  }
}
