# ADR-003: Sesión y autenticación

- Estado: Propuesta
- Fecha: 2026-09-11
- Alcance: Semana 06
- Dominio: Sesión

## Contexto

CampusOps tiene tres perfiles con diferentes permisos: Reportante, Técnico y Coordinador. Cada perfil puede ejecutar operaciones distintas sobre las incidencias. La autenticación se realiza con tokens JWT que expiran.

Cuando un token expira, múltiples requests en vuelo pueden recibir un 401 simultáneamente. Si cada request intenta refrescar el token por separado, se genera una tormenta de refreshes que sobrecarga el backend y puede causar comportamientos indefinidos.

El tipo `AuthEvent` define los eventos del ciclo de vida:

```typescript
type AuthEvent =
  | { type: 'request401'; requestId?: string; generation?: number }
  | { type: 'refreshSucceeded'; generation?: number; token?: string }
  | { type: 'refreshFailed'; generation?: number }
  | { type: 'logout'; requestId?: string };
```

La función `coordinateRefresh` debe recibir una secuencia de eventos y producir un resumen que indique cuántos refreshes se ejecutaron, qué requests se reintentaron y si el token se actualizó.

## Alternativas consideradas

### Alternativa 1: Token coalescing (refresh coordinado)

Cuando múltiples requests reciben 401, sólo uno ejecuta el refresh. Los demás esperan el resultado. Una vez que el refresh exitoso llega, todos los requests reintentan con el nuevo token.

```typescript
coordinateRefresh(events) → {
  refreshCount: number;
  retriedRequests: string[];
  token?: string;
}
```

Ventajas:

- Una llamada de red para N requests concurrentes.
- Evita la tormenta de refreshes.
- El `generation` permite detectar refreshes obsoletos (si el token cambió entre refreshes, el anterior se descarta).
- Logout limpia el token persistido y cancela refreshes pendientes.

Costos:

- Requiere coordinación por generación.
- La lógica de espera es más compleja que el refresh individual.
- Si el refresh falla, todos los requests fallan (punto único de fallo).

### Alternativa 2: Refresh por request

Cada request que recibe 401 ejecuta su propio refresh y reintenta.

Ventajas:

- Implementación simple: lógica de retry inline.
- Sin coordinación entre requests.

Costos:

- N llamadas de red para N requests concurrentes.
- Puede sobrecargar el backend con refreshes duplicados.
- Si el refresh tarda, los requests en cola acumulan tiempo de espera.
- No hay garantía de que todos los requests usen el mismo token.

## Decisión

Se adopta la alternativa 1: token coalescing con coordinación por generación.

La función `coordinateRefresh` procesa una secuencia de eventos y determina:

1. Cuántos refreshes se ejecutaron (máximo 1 por generación).
2. Qué requests se reintentaron después del refresh exitoso.
3. Si hubo logout, limpia el token persistido.

El `generation` es un contador que incrementa cada vez que se ejecuta un refresh. Si llega un `refreshSucceeded` con una generación obsoleta (menor que la actual), se descarta.

El token se persiste en almacenamiento seguro (Expo SecureStore). El logout elimina el token persistido y cualquier estado de refresh pendiente.

## Justificación y trade-off

### Facilidad de prueba

`coordinateRefresh` es una función pura: recibe una lista de eventos y retorna un resumen. No necesita React Native, red ni almacenamiento. Se puede probar con secuencias deterministas de eventos.

### Complejidad

El coalescing requiere lógica de generación y cola de requests pendientes. Se acepta porque la alternativa (refresh por request) genera un problema de rendimiento mayor en producción.

### Cambio de proveedor

El mecanismo de refresh es independiente del proveedor de almacenamiento de tokens. Si se cambia de Expo SecureStore a AsyncStorage, sólo cambia la capa de persistencia, no la lógica de coordinación.

El endpoint de refresh puede cambiar sin afectar la lógica: la función opera sobre eventos, no sobre HTTP.

## Consecuencias

- `coordinateRefresh` debe ser una función pura.
- El token se persiste en Expo SecureStore (o alternativa segura).
- Logout limpia el token y cancela refreshes pendientes.
- El `generation` previene que refreshes obsoletos sobreescriban tokens válidos.
- Si el refresh falla, todos los requests pendientes fallan con el mismo error.
- Los requests que llegan después del refresh exitoso se reintentan automáticamente.
- Los requests que llegan durante un refresh en curso esperan el resultado.

## Verificación

La prueba de semana 06 (`course-tests/public/week-06.test.ts`) valida:

- 3 requests concurrentes con 401 generan sólo 1 llamada de refresh.
- Los 3 requests se reintentan después del refresh exitoso.
- El token persistido se actualiza con el nuevo valor.
- Logout elimina el token persistido.
