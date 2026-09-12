# ADR-004: Geocodificación y tolerancia a fallos

- Estado: Propuesta
- Fecha: 2026-09-11
- Alcance: Semana 09
- Dominio: Ubicación

## Contexto

CampusOps requiere que las incidencias incluyan una ubicación. El tipo `IncidentLocation` define dos fuentes posibles:

```typescript
type IncidentLocation = {
  source: 'provider' | 'manual';
  label: string;
  latitude?: number;
  longitude?: number;
};
```

Cuando el usuario ingresa una dirección, la app puede consultar un proveedor de geocodificación para obtener coordenadas. Si el proveedor falla, está saturado (429) o retorna coordenadas inválidas, la app debe degradarse graceful a input manual.

La función `selectIncidentLocation` valida la respuesta del proveedor y decide si la acepta o hace fallback:

```typescript
selectIncidentLocation(provider: unknown, manualLabel: string) → IncidentLocation
```

La función `planRetry` decide si una request fallida debe reintentarse:

```typescript
planRetry(input: {
  method: string;
  status: number;
  attempt: number;
  retryAfterMs?: number;
  idempotencyKey?: string;
}) → {
  retry: boolean;
  delayMs: number;
  requiresStableIdempotencyKey: boolean;
}
```

## Alternativas consideradas

### Alternativa 1: Provider con validación, caché y fallback manual

La app consulta el proveedor de geocodificación. Si la respuesta es válida (label no vacío, coordenadas finitas en rango válido), se usa. Si no, se hace fallback a `source: 'manual'` con la dirección del usuario.

Se almacenan resultados recientes en caché para evitar llamadas repetidas. `planRetry` maneja timeouts, 429 (rate limit) y POST sin idempotency key.

Ventajas:

- Coordenadas automáticas cuando el proveedor funciona.
- Fallback siempre disponible: la app nunca se bloquea por geocodificación.
- Caché reduce llamadas al proveedor.
- Retry con backoff respeta rate limits.

Costos:

- Complejidad media: validación + caché + retry.
- Requiere configurar el proveedor de geocodificación.
- La caché puede quedar obsoleta si la dirección cambia.

### Alternativa 2: Solo input manual

El usuario ingresa la dirección como texto. No se consultan proveedores externos.

Ventajas:

- Sin dependencia de proveedores externos.
- Sin necesidad de API key.
- Implementación mínima.

Costos:

- Sin coordenadas GPS: no se puede mostrar en mapa.
- Experiencia de usuario degradada.
- La ubicación depende exclusivamente de la precisión del usuario.

### Alternativa 3: Provider sin caché ni fallback

La app consulta el proveedor y usa la respuesta si es válida. Si falla, la incidencia se crea sin ubicación.

Ventajas:

- Sin caché: datos siempre frescos.
- Implementación más simple que Alternativa 1.

Costos:

- Si el provider falla, no hay ubicación (la app se bloquea o pierde datos).
- Sin retry: un error transitorio pierde la ubicación.
- Sin fallback: el usuario no puede alternar a manual.

## Decisión

Se adopta la alternativa 1: provider con validación, caché y fallback manual.

El proveedor de geocodificación se encapsula en infrastructure como un adaptador. La UI y los casos de uso conocen únicamente el tipo `IncidentLocation` y la función `selectIncidentLocation`.

La validación verifica:

- `label` es un string no vacío.
- `latitude` y `longitude` son números finitos en rango válido (-90 a 90 para latitud, -180 a 180 para longitud).

Si la validación falla, se retorna `{ source: 'manual', label: manualLabel }` sin coordenadas. No se inventan coordenadas para el fallback.

`planRetry` aplica las siguientes reglas:

- Timeout o error de red: reintentar con backoff.
- 429 (rate limit): reintentar después de `Retry-After` ms.
- POST sin idempotency key: no reintentar (riesgo de duplicados).
- Intento 4 o mayor: no reintentar (máximo 3 intentos).

## Justificación y trade-off

### Facilidad de prueba

`selectIncidentLocation` es una función pura: recibe la respuesta del proveedor y la etiqueta manual, y retorna un `IncidentLocation`. Se puede probar con respuestas válidas, nulas, incompletas e inválidas.

`planRetry` también es pura: recibe parámetros y retorna si reintentar. Se puede probar con cada variante de error.

### Complejidad

La caché agrega complejidad de storage. Se acepta porque evita llamadas repetidas al proveedor para la misma dirección. La caché se invalida por TTL o por cambio de dirección.

El retry con backoff es más complejo que no reintentar, pero es necesario para manejar 429 y timeouts transitorios.

### Cambio de proveedor

El adaptador de geocodificación se encapsula en infrastructure. Cambiar de Google Maps a OpenStreetMap/Nominatim requiere implementar un nuevo adaptador y actualizar la composición. La UI y los casos de uso no cambian.

## Consecuencias

- `selectIncidentLocation` debe ser una función pura.
- `planRetry` debe ser una función pura.
- El proveedor de geocodificación se encapsula en infrastructure.
- La caché se almacena en AsyncStorage o en memoria con TTL.
- Las coordenadas se validan antes de aceptarlas.
- El fallback a manual nunca inventa coordenadas.
- El máximo de reintentos es 3.
- POST sin idempotency key no se reintenta.
- 429 se respeta con `Retry-After`.

## Verificación

La prueba de semana 09 (`course-tests/public/week-09.test.ts`) valida:

- Respuesta válida del proveedor → `{ source: 'provider', label, latitude, longitude }`.
- Respuesta nula, 429, incompleta o con coordenadas inválidas → `{ source: 'manual', label }`.
- Timeout con idempotency key → reintentar.
- 429 con Retry-After → reintentar con delay.
- Intento 4 timeout → no reintentar.
- POST sin idempotency key → no reintentar.
