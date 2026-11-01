# Política de resiliencia de CampusOps

## Proveedor y ejecución real

CampusOps usa el endpoint `https://geocoding-api.open-meteo.com/v1/search` de Open-Meteo. No requiere clave ni cuenta. Su modalidad gratuita permite uso no comercial sujeto a uso razonable y no ofrece garantía de disponibilidad ni nivel de servicio. Por eso la aplicación no depende del proveedor para terminar el registro de una incidencia.

La ejecución real con consultas ficticias está en [`reports/week-09/live-geocoding-run.json`](../reports/week-09/live-geocoding-run.json). Registra un resultado de Open-Meteo, una lectura posterior desde caché y el uso de una etiqueta manual para un lugar ficticio inexistente. Los fallos repetibles se prueban con el doble controlado del backend del curso, que ofrece escenarios de datos incompletos, respuesta inválida, error de servidor, 429, timeout y desconexión sin depender de cuotas o disponibilidad externa.

## Caché y alternativa manual

La caché vive en memoria, normaliza la consulta y conserva como máximo 50 resultados válidos del proveedor durante 24 horas. Usa expulsión por uso reciente y nunca almacena fallos, respuestas inválidas ni etiquetas manuales. Así, una falla temporal vuelve a consultar el servicio en la siguiente búsqueda.

Si el proveedor no puede entregar una ubicación válida, CampusOps conserva la etiqueta escrita por la persona —edificio, zona o referencia— sin inventar coordenadas. Si tampoco hay una etiqueta, la pantalla la solicita antes de permitir crear la incidencia. El backend recibe únicamente `location.label`, porque su contrato de creación acepta texto.

## Cuándo reintentar, usar una alternativa o informar el fallo

| Regla | Respuesta de CampusOps | Prueba |
|---|---|---|
| Un GET termina en timeout, 408, 429, 500, 502, 503 o 504. | Reintenta hasta cuatro intentos totales. La espera comienza en 250 ms y se duplica hasta el límite configurado. Un `Retry-After` válido se respeta; si supera 5 s, no se espera ni se reintenta. | `course-tests/resilience-policy.test.ts`: “retries transient GET failures with progressive, capped waits and stops from attempt 4” y “honours a valid Retry-After exactly and refuses to wait longer than the limit”. `course-tests/resilience-backend.test.ts`: casos `server_error`, 429, timeout y esperas reales. |
| El dispositivo está desconectado, la respuesta es inválida o el servidor da una decisión no transitoria. | No reintenta. Para geocodificación usa inmediatamente la etiqueta manual; si falta, solicita escribirla. | `course-tests/resilience-policy.test.ts`: casos de estado no reintentable, proveedor no disponible, datos inválidos y etiqueta ausente. `course-tests/resilience-backend.test.ts`: datos incompletos, respuesta malformada, desconexión y etiqueta ausente. |
| Un POST falla de forma transitoria y tiene una clave de idempotencia estable. | Reintenta con la misma clave y el mismo contenido, hasta el límite. Una respuesta perdida después de guardar queda como un solo efecto. | `course-tests/resilience-policy.test.ts`: “a POST is repeated only with a stable idempotency key”. `course-tests/resilience-backend.test.ts`: resolución, cierre, evidencia y creación con respuesta perdida. |
| Un POST no tiene clave estable, se agotan los intentos o el fallo no es transitorio. | No reintenta y comunica el fallo tipado a la interfaz. No genera una identidad nueva para ocultar una repetición. | `course-tests/resilience-policy.test.ts`: POST sin clave y límite del cuarto intento. `course-tests/resilience-backend.test.ts`: POST con error persistente y comportamiento sin reintentos configurados. |

Estas reglas corresponden a las políticas publicadas al inicio de `src/campusops/domain/retryPolicy.ts` y `src/campusops/infrastructure/remote/geocodingProviders.ts`. Los registros de intentos incluyen proveedor, número de intento, resultado, estado, duración y próxima espera, pero omiten consulta, etiqueta, coordenadas, token y actor.
