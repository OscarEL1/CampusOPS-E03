# ADR-002: Persistencia y resolución de conflictos offline

- Estado: Propuesta
- Fecha: 2026-09-11
- Alcance: Semana 08
- Dominio: Persistencia

## Contexto

CampusOps debe permitir que los técnicos trabajen en zonas sin cobertura de red. Mientras están offline, crean incidencias, atienden casos, cambian estado y agregan evidencia. Cuando reconectan, todas las operaciones pendientes deben sincronizarse con el backend.

El riesgo principal (prioridad #1 del risk register) es la reasignación concurrente: un técnico puede estar atendiendo una incidencia offline mientras el coordinador la reasigna remotamente. Si la sincronización sobreescribe sin detectar el conflicto, se pierde el diagnóstico del técnico o la decisión del coordinador.

El tipo `PendingIncidentOperation` ya define la estructura de la cola:

```typescript
type PendingIncidentOperation = {
  operationId: string;
  incidentId: string;
  baseVersion: number;
  actorId: string;
  action: string;
  payload: Record<string, unknown>;
};
```

La cola debe sobrevivir reinicios de la aplicación. Las fotos pendientes de subida requieren almacenamiento local separado.

## Alternativas consideradas

### Alternativa 1: Resolución por campo (merge de tres vías)

Comparar campo por campo entre base, local y remoto. Si un campo cambió sólo en un lado, se acepta el cambio. Si cambió en ambos lados, se marca como conflicto.

```typescript
resolveSync(base, local, remote) → { merged } | { conflict: string[] }
```

Ventajas:

- Mantiene cambios independientes (ej: título local + prioridad remota = merge válido).
- Los conflictos se reportan por nombre de campo, ordenados alfabéticamente.
- La función es pura: no muta ninguno de los tres inputs.
- El campo compuesto `work` (assignedTechnicianId + status) es la unidad de conflicto natural.

Costos:

- Requiere traversión de campos y comparación por tipo.
- Los campos anidados (como `location`) necesitan reglas específicas.
- La presentación de conflictos al usuario requiere UI adicional.

### Alternativa 2: Última escritura gana

La escritura más reciente (por `baseVersion` o timestamp) sobreescribe completamente el registro.

Ventajas:

- Implementación simple: comparar versiones y sobreescribir.
- Sin necesidad de detectar conflictos por campo.

Costos:

- Pierde cambios del lado perdedor sin informar al usuario.
- Un diagnóstico del técnico puede perderse si el coordinador reasigna después.
- Viola la regla de negocio de preservar la intención de ambas partes.

### Alternativa 3: Resolución manual del usuario

Presentar ambos estados (local vs remoto) al usuario y dejar que decida cuál conservar.

Ventajas:

- Preserva la intención del usuario en todos los casos.
- Sin pérdida de datos.

Costos:

- Complejidad alta: requiere UI de presentación de conflictos.
- El usuario debe entender ambos estados para decidir.
- No escala si hay múltiples conflictos simultáneos.
- La sincronización se bloquea hasta que el usuario resuelva.

## Decisión

Se adopta la alternativa 1: resolución por campo con merge de tres vías.

Las operaciones pendientes se persisten en almacenamiento local (AsyncStorage o SQLite) y se reenvían al reconectar. Cada operación lleva un `operationId` que garantiza idempotencia: si el backend ya procesó la operación, el reenvío no crea duplicados.

El campo compuesto `work` (assignedTechnicianId + status) es la unidad crítica de conflicto. Si el técnico cambió `status` offline y el coordinador cambió `assignedTechnicianId` remotamente, ambos cambios se detectan como conflicto en `work` y se presentan al usuario para resolución.

Las fotos pendientes se almacenan en el sistema de archivos local, referenciadas por `operationId`. La cola de operaciones se mantiene ordenada por `operationId` para procesamiento secuencial.

## Justificación y trade-off

### Facilidad de prueba

`resolveSync` es una función pura: recibe tres objetos y retorna merged o conflict. No necesita React Native, red ni almacenamiento. Se puede probar con datos deterministas.

`deduplicateOperations` también es pura: recibe una lista y retorna la lista sin duplicados por `operationId`.

### Complejidad

La resolución por campo tiene complejidad media: requiere traversión de campos y comparación por tipo. Se acepta porque los campos de `Incident` son planos (strings, nulls, objetos simples) y no hay jerarquías complejas.

La persistencia de la cola agrega complejidad de storage. Se minimiza manteniendo la cola como lista serializable de objetos planos.

### Cambio de proveedor

El mecanismo de resolución es independiente del proveedor de persistencia. Si se cambia de AsyncStorage a SQLite, sólo cambia la capa de lectura/escritura de la cola, no la lógica de merge.

El backend puede cambiar de REST a GraphQL sin afectar la cola local: la cola opera sobre `PendingIncidentOperation`, no sobre el protocolo de red.

## Consecuencias

- `resolveSync` debe ser una función pura sin efectos colaterales.
- La cola de operaciones debe persistirse y recuperarse al reiniciar la app.
- Las fotos pendientes requieren almacenamiento local separado de la cola.
- El `operationId` se genera con UUID para garantizar unicidad.
- Los conflictos se presentan al usuario con los campos en conflicto ordenados alfabéticamente.
- La sincronización no se bloquea por conflictos: las operaciones sin conflicto se procesan y las conflictivas se encolan para resolución manual.
- El campo `work` (assignedTechnicianId + status) requiere comparación especial porque es un objeto compuesto.

## Verificación

La prueba de semana 08 (`course-tests/public/week-08.test.ts`) valida:

- `resolveSync` detecta conflicto en el campo `work` cuando technician atiende offline y coordinator reasigna remotamente.
- `resolveSync` mergea cambios independientes (título local + prioridad remota).
- `resolveSync` no muta los inputs.
- `deduplicateOperations` conserva la primera ocurrencia por `operationId`.
