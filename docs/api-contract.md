# Contrato del cliente de incidencias

Este documento describe el límite que implementa la aplicación. El backend didáctico se consulta en `/v1/incidents`; todas las solicitudes llevan `Accept: application/json`, `Authorization: Bearer <token>` y `X-Course-Actor: <actorId>`. El token y el actor son proporcionados por la raíz de composición, no por una pantalla.

## Lista, detalle y creación

| Operación | Solicitud | Respuesta exitosa que acepta el cliente |
|---|---|---|
| Lista | `GET /v1/incidents` sin cuerpo | `{ "items": [RemoteResource, ...] }`. Una lista vacía es válida. Si un elemento es inválido se rechaza la lista completa. |
| Detalle | `GET /v1/incidents/:id`, con el ID codificado para URL | Un `RemoteResource`. El `id` recibido debe coincidir con el solicitado. |
| Creación | `POST /v1/incidents`, `Content-Type: application/json`, `Idempotency-Key: <clave>` y cuerpo `{ "category": string, "description": string, "location": string }` | `{ "incident": RemoteResource, "operationId": string, "duplicate": boolean }`. El cliente usa `incident` y `duplicate`; los datos deben satisfacer el mismo contrato que un detalle. |

`RemoteResource` tiene la forma `{ id, version, status, payload }`:

- `id`: texto no vacío.
- `version`: entero mayor o igual que cero.
- `status`: texto no vacío en el límite del sobre y, al convertir una incidencia, uno de `open`, `assigned`, `in_progress`, `resolved` o `closed`.
- `payload`: objeto o `null`. Cuando es objeto, los campos que consume la app son `category`, `description`, `location`, `reporterId` y `assignedTechnicianId`. El DTO también puede transportar campos del servidor como `priority`, `notes`, `evidence`, `history` y `diagnosis`, pero la aplicación no los copia al dominio.

La creación solo acepta una categoría de `electrical`, `laboratory`, `water`, `connectivity`, `equipment`, `safety` o `maintenance`, además de descripción y ubicación con texto no vacío. La pantalla elimina espacios de los extremos y valida esos tres datos antes de llamar al cliente. El adaptador construye explícitamente el cuerpo con esos tres campos, por lo que propiedades adicionales de un objeto llamador no salen por la red.

## DTO frente a objetos de la aplicación

El JSON recibido es `unknown` hasta atravesar dos límites. Primero, [`remoteResource.ts`](../src/campusops/infrastructure/remote/remoteResource.ts) valida el sobre y copia solamente `id`, `version`, `status` y `payload`. Después, [`incidentDto.ts`](../src/campusops/infrastructure/remote/incidentDto.ts) valida los campos de la incidencia y los traduce a un `Incident` del dominio. Por ejemplo, el DTO no trae `title`; la aplicación deriva una etiqueta fija desde la categoría. La `version` se conserva junto al objeto en `RemoteIncident`, porque describe la copia remota y no a la entidad del dominio.

Un `payload: null` es válido y significa que el servidor informó la existencia y estado del recurso sin entregar sus detalles. Se representa como `{ kind: "withheld", summary: { id, version, status } }`: no es una falla, no produce una incidencia parcialmente rellenada y no autoriza inventar categoría, descripción, ubicación o propietario. Un payload ausente, con otro tipo o con campos consumidos inválidos sí produce `invalid_response`.

## Fallos y plazo

Las operaciones resuelven un `RemoteResult<T>`; no usan excepciones como contrato de negocio. Los fallos distinguibles son:

| Tipo | Significado |
|---|---|
| `timeout` | Se agotó el plazo del cliente; incluye `timeoutMs`. |
| `network` | El transporte falló antes de obtener una respuesta HTTP válida. |
| `server_error` | Respuesta 5xx; conserva el estado numérico. |
| `rate_limited` | Respuesta 429; conserva `Retry-After` en milisegundos cuando es legible. |
| `unauthorized`, `forbidden`, `not_found` | Respuestas 401, 403 y 404, respectivamente. |
| `rejected` | Otro estado no exitoso; conserva estado y código público si existe. |
| `invalid_response` | Estado HTTP imposible, JSON ilegible o datos que rompen el contrato. |

[`httpIncidentGateway.ts`](../src/campusops/infrastructure/remote/httpIncidentGateway.ts) realiza la clasificación, valida las respuestas y limita toda la operación —incluida la lectura del cuerpo— a **8 000 ms** por defecto. Al vencer el plazo aborta la solicitud y devuelve `timeout`; una excepción del transporte se convierte en `network`. La UI obtiene su texto mediante `describeRemoteFailure` y no presenta códigos o razones internas.

## Idempotencia de creación

La clave identifica una intención de creación y no es una credencial. Se genera una sola vez al iniciar un borrador y se conserva para todos sus reintentos. Esto cubre el caso en que el servidor guardó la incidencia pero la respuesta se perdió: repetir el mismo cuerpo con la misma clave permite que el backend responda con `duplicate: true` y reproduzca el resultado sin crear otra incidencia. Una clave nueva en cada reintento convertiría el mismo gesto del usuario en operaciones distintas. La pantalla informa `Esta incidencia ya estaba registrada.` cuando recibe ese indicador.

La serialización, el encabezado `Idempotency-Key`, el análisis de `duplicate` y la conversión a resultados tipados están implementados en [`httpIncidentGateway.ts`](../src/campusops/infrastructure/remote/httpIncidentGateway.ts). La validación compartida del sobre está en [`remoteResource.ts`](../src/campusops/infrastructure/remote/remoteResource.ts) y la separación concreta entre DTO y dominio en [`incidentDto.ts`](../src/campusops/infrastructure/remote/incidentDto.ts).
