# ADR-005: Privacidad y sanitización de telemetría

- Estado: Propuesta
- Fecha: 2026-09-11
- Alcance: Semana 04
- Dominio: Privacidad

## Contexto

CampusOps maneja datos sensibles: tokens de autenticación, correos electrónicos, ubicaciones, fotos, comentarios internos e historial de asignaciones. Cuando se genera telemetría (logs, reportes de errores, evidencia de sincronización), estos datos deben ser redactados para evitar filtraciones.

El risk register clasifica la filtración de datos sensibles como prioridad #2 con probabilidad media e impacto alto. Los datos sensibles pueden filtrarse durante:

- Flujos de error que incluyen contexto de la request.
- Sincronización que registra payloads.
- Evidencia de debugging que captura estado de la app.

La función `redactForTelemetry` debe recibir cualquier valor y retornar una copia donde los campos sensibles tengan valor `[REDACTED]`:

```typescript
redactForTelemetry(input: unknown) → unknown
```

16 campos sensibles deben ser redactados:

- `authorization`, `token`, `accessToken`, `refreshToken`
- `email`, `displayName`
- `location`, `latitude`, `longitude`, `address`
- `photos`, `photo`, `image`
- `internalComments`, `internalNotes`
- `assignmentHistory`

Los campos técnicos deben preservarse:

- `incidentId`, `correlationId`, `requestId`
- `status`, `attempt`, `durationMs`
- `accept`, `method`, `endpoint`

## Alternativas consideradas

### Alternativa 1: Redacción por lista de keys sensibles

Se define una lista explícita de 16 keys. La función traversa objetos y arrays recursivamente. Cuando encuentra una key en la lista, reemplaza el valor por `[REDACTED]`. Las keys se normalizan (lowercase, sin `_` ni `-`) para cubrir variaciones (`authorization`, `Authorization`, `AUTHORIZATION`).

Ventajas:

- Precisión: sólo redacta lo sensible.
- Los campos técnicos se preservan automáticamente.
- La lista es explícita y revisable.
- Los keys normalizados cubren variaciones de naming.

Costos:

- Requiere mantener la lista actualizada.
- Si se agrega un campo sensible y no se actualiza la lista, se filtra.
- La normalización de keys agrega complejidad menor.

### Alternativa 2: Redacción por tipo de dato

Todo valor de tipo string se reemplaza por `[REDACTED]`.

Ventajas:

- Sin necesidad de lista de keys.
- Cubre cualquier campo nuevo automáticamente.

Costos:

- Pierde datos útiles: `incidentId`, `status`, `method` son strings.
- Los logs pierden valor diagnóstico.
- No se puede distinguir entre un campo sensible y uno técnico.

## Decisión

Se adopta la alternativa 1: redacción por lista de keys sensibles con normalización.

La función `redactForTelemetry`:

1. Si el input es null o primitivo, lo retorna sin cambio.
2. Si el input es un array, traversa cada elemento recursivamente.
3. Si el input es un objeto, traversa cada key. Si la key normalizada está en la lista sensible, reemplaza el valor por `[REDACTED]`. Si no, traversa el valor recursivamente.
4. No muta el input: retorna un nuevo objeto con la misma estructura.

La normalización convierte la key a lowercase y elimina `_` y `-`. Esto asegura que `Authorization`, `AUTHORIZATION`, `authorization` y `authorization_header` se reconozcan como el mismo campo.

## Justificación y trade-off

### Facilidad de prueba

`redactForTelemetry` es una función pura: recibe un valor y retorna un valor. No necesita React Native, red ni almacenamiento. Se puede probar con:

- Objetos planos con keys sensibles.
- Objetos anidados con keys sensibles en múltiples niveles.
- Arrays de objetos.
- Primitivos (string, number, boolean, null).
- Verificar que el input original no se modifica.

### Complejidad

La traversión recursiva es más compleja que un reemplazo plano, pero necesaria porque los payloads de CampusOps incluyen objetos anidados (ej: `location` con `latitude`/`longitude`, `work` con `assignedTechnicianId`/`status`).

La normalización de keys agrega complejidad menor pero es necesaria para cubrir variaciones de naming en diferentes capas (HTTP headers, JSON body, logs).

### Cambio de proveedor

La función es independiente del proveedor de telemetría. Si se cambia de Sentry a Datadog, la función de redacción no cambia. Sólo se actualiza la lista si se descubren nuevos campos sensibles.

## Consecuencias

- `redactForTelemetry` debe ser una función pura.
- No muta el input: retorna un nuevo objeto.
- Traversa arrays y objetos recursivamente.
- Keys normalizadas (lowercase, sin `_` ni `-`).
- Si se agrega un campo sensible, se actualiza la lista.
- Los campos técnicos (`incidentId`, `status`, `attempt`, `durationMs`) se preservan.
- El valor de reemplazo es siempre `[REDACTED]`.
- Los objetos vacíos y arrays vacíos se retornan sin cambios.

## Verificación

La prueba de semana 04 (`course-tests/public/week-04.test.ts`) valida:

- 16 keys sensibles se reemplazan por `[REDACTED]`.
- Campos técnicos (`incidentId`, `accept`) se preservan.
- Input original no se modifica (inmutabilidad).
- Traversión de objetos anidados funciona correctamente.
- Arrays de objetos se procesan correctamente.
