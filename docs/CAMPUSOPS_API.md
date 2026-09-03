# CampusOps — contrato público de integración y pruebas

Este contrato concreta los criterios existentes, sin añadir puntos ni cambiar rúbricas. Los adaptadores de `src/course-evaluation/index.ts` deben invocar la lógica real de la app; no crear implementaciones separadas que sólo satisfagan tests. Sus funciones pendientes se implementan en la semana correspondiente, no al recibir el starter.

## Backend didáctico

Ejecutar `make run-backend`; comprobar `npm run backend:self-test`. La dirección por defecto es `http://127.0.0.1:4310`. En emulador Android usar `http://10.0.2.2:4310`; para dispositivo físico usar la IP de desarrollo autorizada y configurar `COURSE_BACKEND_HOST` sólo en una red de laboratorio. Nunca exponer este simulador a Internet.

Los actores públicos de prueba son `reporter-1`, `reporter-2`, `technician-1`, `technician-2` y `coordinator-1`. No son matrículas ni miembros del roster. `POST /v1/session/login` con `{ "actorId": "technician-1" }` devuelve la sesión sintética. Las rutas CampusOps usan `Authorization: Bearer course-valid-token` y `X-Course-Actor` con el ID seleccionado. Estos valores son fixtures públicos, no secretos ni autenticación de producción. Ninguna app real debe confiar en un rol enviado por el cliente.

| Ruta | Contrato |
|---|---|
| `GET /health` | Salud del backend; contrato original v1 conservado. |
| `GET /v1/incidents` | `{ items: [...] }`; reportante ve sus reportes, técnico sus asignaciones, coordinador todos. |
| `GET /v1/incidents/:id` | DTO de una incidencia visible para el actor. |
| `POST /v1/incidents` | Reportante crea con categoría válida, descripción no vacía y `location` textual. Requiere `Idempotency-Key` estable. |
| `POST /v1/incidents/:id/actions` | `{ action, baseVersion, ... }` con `Idempotency-Key`; 409 ante versión obsoleta o reutilización de clave con otro contenido, 403 ante rol/asignación incompatible. |
| `GET /v1/geocoding?q=...` | Doble de proveedor: `{ label, latitude, longitude }`. No consulta lugares reales. |

Las acciones son `assign` (technicianId), `prioritize` (priority: low/medium/high), `start`, `resolve` (diagnosis), `close`, `reopen`, `comment` (text) y `add_evidence` (evidenceId de un recurso sintético). La transición de estados y perfiles se describe en `CAMPUSOPS.md`. El servidor conserva ID, versión, estado, payload e historial. Rechazos no modifican el recurso ni consumen una operación exitosa.

La incidencia inicial `campus-inc-001` pertenece a `reporter-1`, está asignada a `technician-1` y tiene versión 1. El simulador guarda estado en memoria y se reinicia al reiniciar el proceso. Las referencias de evidencia son metadatos de prueba: el equipo implementa almacenamiento/carga de imágenes y persistencia de su cola, no debe confundir una referencia con un archivo ya subido.

## Variantes públicas

Seleccionar `X-Course-Scenario`: `success`, `nullable`, `server_error` (500), `rate_limited` (429 y Retry-After), `malformed`, `slow`, `invalid_coordinates`, `incomplete` o `timeout_after_commit`. Las últimas dos variantes de datos aplican a geocodificación; respuesta perdida aplica a escrituras. El cliente puede abortar por su propio timeout mientras el servidor ya guardó el cambio. El simulador permite repetir exactamente la operación para comprobar que no se duplica el historial.

Se conservan `/v1/resources`, `/v1/resources/action` y `/v1/session/refresh` para los contratos originales. El nuevo dominio no modifica sus firmas. Los tests no requieren red pública ni cuentas de proveedores.

## Adaptadores evaluables, por semana

### Semana 4 — sanitización

`redactForTelemetry` recorre objetos/listas sin mutar la entrada. Sustituye el valor completo por `[REDACTED]` cuando la clave, normalizada a minúsculas y sin `_`/`-`, sea: `authorization`, `password`, `token`, `accessToken`, `refreshToken`, `email`, `displayName`, `name`, `userId`, `reporterId`, `technicianId`, `assignedTechnicianId`, `location`, `latitude`, `longitude`, `photos`, `evidence`, `internalComments` o `assignmentHistory`. Conserva campos técnicos no sensibles como `incidentId`, `correlationId`, `status`, `attempt` y `durationMs`. Esto es un mínimo de prueba, no permiso para registrar texto libre sin sanitizar.

### Semanas 5–6 — DTO y sesión

`parseRemoteResource` valida el sobre `{ id, version, status, payload }`: ID/estado no vacíos, versión entera no negativa y payload objeto o null. Ignora campos futuros del sobre. El cliente valida además el dominio antes de ejecutar una operación; un payload null válido no autoriza inventar datos. `coordinateRefresh` conserva el contrato de concurrencia/expiración/logout existente, aplicado a solicitudes de incidencias. Probar también autorización real contra el backend.

### Semana 8 — sincronización

`resolveSync(base, local, remote)` conserva su firma: cambios independientes se combinan; cambios distintos sobre el mismo campo se reportan en orden de nombre. Comparar por contenido JSON, no por identidad de objeto. En los escenarios de CampusOps el campo `work` contiene asignado y estado: una reasignación remota y un inicio local son incompatibles. No descartar la cola por obtener un conflicto. `deduplicateOperations` conserva la primera operación de cada `operationId`, sin mutar la entrada.

La aplicación debe demostrar además recuperación de cola tras reiniciar y migración/rollback en sus pruebas y reportes existentes; los tests de una función pura no demuestran persistencia real.

### Semana 9 — resiliencia y ubicación manual

`planRetry` conserva la firma y límites publicados: intentos acotados (no reintentar desde intento 4), respetar Retry-After válido, demoras finitas y POST sólo con identidad estable.

`selectIncidentLocation(provider, manualLabel)` recibe un resultado externo desconocido y una etiqueta manual no vacía. Acepta únicamente objeto con `label` textual no vacío y coordenadas numéricas finitas dentro de latitud [-90,90] y longitud [-180,180]. Devuelve `{ source: 'provider', label, latitude, longitude }`. Ante null, error representado como dato, objeto incompleto, coordenadas inválidas o tipos incorrectos devuelve `{ source: 'manual', label: manualLabel }`, sin inventar coordenadas. Un timeout/429/desconexión se captura en el adaptador HTTP y se presenta como resultado no disponible.

El equipo prueba también caché, timeout real, reintentos con la misma clave y captura manual desde la interfaz. No basta con retornar una respuesta constante.

### Semanas 10–13 — integración acumulativa

Conservar `reduceRemoteResponses` y `reducePermissionLifecycle` para respuestas obsoletas y revocación. Los tests de contratos no reemplazan verificar pantallas/recursos nativos, cobertura acumulativa, debug/release ni distribución. Cámara/galería/ubicación no se implementan en el starter; son trabajo del equipo con los permisos mínimos declarados.
