# Política de sincronización y conflictos

La política ejecutable está resumida al inicio de [`syncEngine.ts`](../src/campusops/application/syncEngine.ts). Su objetivo es conservar tanto la intención creada sin conexión como el estado confirmado del servidor, sin duplicar efectos ni sobrescribir una reasignación.

## Qué se combina y qué constituye un conflicto

La reconciliación compara tres estados: la base que conocía el dispositivo, la intención local y la copia remota actual.

- Un campo cambiado sólo localmente se conserva.
- Un campo cambiado sólo remotamente se conserva.
- Si ambos lados produjeron exactamente el mismo valor, no hay conflicto.
- Cambios distintos sobre el mismo campo se declaran como conflicto.
- `work` es una unidad compuesta por `assignedTechnicianId` y `status`. Un inicio local cambia el estado, mientras una reasignación remota cambia al responsable; por afectar la misma unidad de trabajo, requiere resolución explícita.
- Las notas y referencias de evidencia usan campos identificados por la operación o la referencia. Pueden combinarse con cambios remotos independientes, como la prioridad.

La regla pura se prueba en [`sync-merge.test.ts`](../course-tests/sync-merge.test.ts): “offline start against a remote reassignment is a conflict on work”, “independent changes are combined”, “every incompatible field is reported” y “both sides making the same change is not a conflict”. El flujo contra el servidor se prueba en [`sync-backend.test.ts`](../course-tests/sync-backend.test.ts): “offline start against a reassignment...” e “independent changes from the same base are combined...”.

## Autorización antes y durante la sincronización

Antes de encolar, el cliente aplica la política del perfil:

- Sólo el técnico actualmente asignado puede iniciar o resolver.
- Una nota o referencia de foto requiere que el actor pueda consultar la incidencia.
- Una incidencia no guardada produce `not_cached`; contenido vacío o fuera del límite produce `invalid`; falta de permiso produce `forbidden`.

Esta validación reduce acciones imposibles, pero no concede autoridad. Al sincronizar, el servidor vuelve a validar el perfil y la asignación. Una respuesta `403` seguida de una incidencia que el técnico ya no puede consultar se interpreta como reasignación y conflicto en `work`; no se intenta restaurar la asignación anterior.

La frontera local se prueba en [`local-store.test.ts`](../course-tests/local-store.test.ts), caso “the week 06 role policy applies before anything is queued”. La revalidación y el `403` por reasignación se comprueban en [`sync-backend.test.ts`](../course-tests/sync-backend.test.ts), caso “offline start against a reassignment...”.

## Identidad estable e idempotencia

Cada intención recibe un solo `operationId` cuando se encola. Ese mismo valor se conserva en SQLite y se envía como encabezado `Idempotency-Key` en todos sus intentos. Un reintento nunca genera una clave nueva ni cambia el contenido original.

Si la respuesta se pierde después de que el servidor aplicó el cambio, el dispositivo conserva la operación. Al repetirla con la misma identidad, el servidor puede responder `duplicate: true`; la sincronización la considera confirmada sin producir un segundo efecto.

La unicidad local y la conservación de la primera operación se prueban en [`local-store.test.ts`](../course-tests/local-store.test.ts), caso “the same operationId is stored once...”, y en [`sync-merge.test.ts`](../course-tests/sync-merge.test.ts), caso “keeps the first operation of each operationId...”. El reintento después de perder una respuesta se prueba en [`sync-backend.test.ts`](../course-tests/sync-backend.test.ts), caso “a lost answer: the same operation is sent again and the server applies it only once”.

## Reintentos y retiro de la cola

Las operaciones se envían por actor y en orden de creación. Una operación sale de la cola únicamente cuando el servidor confirma el resultado, incluida una repetición idempotente confirmada como duplicada.

- `timeout`, falla de red, error 5xx, límite de solicitudes, 401 o respuesta inválida no demuestran que el servidor no actuó: la operación permanece y la ejecución se detiene.
- Una versión obsoleta recupera la copia remota. Si los cambios son compatibles, la operación conserva su identidad, se ajusta a la versión nueva y se intenta una vez más.
- Un conflicto o rechazo permanece en la cola y bloquea cambios posteriores de la misma incidencia hasta una decisión.
- `retry(operationId)` devuelve la operación al estado enviable sin cambiar su identidad.
- `discard(operationId)` sólo se ejecuta por una decisión explícita del usuario; el motor de sincronización nunca descarta automáticamente.

La permanencia tras errores se comprueba en [`sync-backend.test.ts`](../course-tests/sync-backend.test.ts), caso “an unconfirmed operation stays pending...”. Que sólo la confirmación elimina y que un problema espera una decisión se prueba en [`local-store.test.ts`](../course-tests/local-store.test.ts), caso “only confirm removes an operation...”.

## Información y resolución del conflicto

Cuando la incidencia fue reasignada, la interfaz explica que el cambio local no se envió y mantiene visible la operación. Presenta dos decisiones separadas:

- **Reintentar:** conserva el cambio y la misma identidad para enviarlo en una sincronización posterior; será aceptado únicamente si la autorización y el estado remoto vuelven a permitirlo.
- **Descartar mi cambio:** elimina sólo la intención local después de que el usuario lo solicita.

La asignación remota se conserva en ambos casos hasta que el servidor reciba una acción válida. La intención local permanece mientras no exista una elección. El caso completo —conflicto, segundo intento retenido y reintento después de una nueva asignación— está en [`sync-backend.test.ts`](../course-tests/sync-backend.test.ts). La vista local que distingue una operación pendiente de una conflictiva está en [`sync-merge.test.ts`](../course-tests/sync-merge.test.ts). La interacción que evita el descarte automático está en [`offline-work-screen.test.tsx`](../course-tests/offline-work-screen.test.tsx).
