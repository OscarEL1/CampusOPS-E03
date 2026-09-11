# ADR-006: Ciclo de vida de permisos de plataforma

- Estado: Propuesta
- Fecha: 2026-09-11
- Alcance: Semana 12
- Dominio: Permisos

## Contexto

CampusOps requiere permisos de plataforma para:

- **Cámara**: fotografiar evidencia de incidencias.
- **Galería**: seleccionar fotos existentes como evidencia.
- **Ubicación**: geolocalizar incidencias.

Cada permiso tiene un ciclo de vida que incluye estados de concesión, pausa, revocación y denegación permanente. El tipo `PermissionEvent` define los eventos:

```typescript
type PermissionEvent =
  | 'granted'
  | 'paused'
  | 'revoked'
  | 'resumed'
  | 'denied_permanently';
```

La función `reducePermissionLifecycle` debe derivar un estado compuesto a partir de una secuencia de eventos:

```typescript
reducePermissionLifecycle(events: PermissionEvent[]) → {
  status: 'available' | 'denied' | 'blocked';
  resourceActive: boolean;
}
```

Las reglas de transición son:

- `granted` → available, resourceActive: true
- `paused` → available, resourceActive: false
- `resumed` → available, resourceActive: true
- `revoked` → denied, resourceActive: false
- `revoked` después de `resumed` → denied, resourceActive: false (permanente)
- `denied_permanently` → blocked, resourceActive: false

## Alternativas consideradas

### Alternativa 1: Solicitud bajo demanda con degradación graceful

La app solicita el permiso sólo cuando el usuario ejecuta la acción que lo requiere (ej: toca el botón de fotografía). Si el permiso se deniega, la app muestra un mensaje y ofrece alternativas (seleccionar de galería, omitir foto). Si el permiso se revoca después de haber sido concedido, la app desactiva la funcionalidad sin cerrar.

Ventajas:

- Mejor experiencia de usuario: no asusta al usuario con múltiples diálogos al inicio.
- Cada flujo maneja su propio permiso.
- La degradación es transparente: la app funciona sin las funciones que requieren el permiso denegado.

Costos:

- Complejidad media: cada flujo debe verificar el permiso antes de ejecutar.
- La máquina de estados debe manejar todas las transiciones.
- La revocación requiere detección y respuesta.

### Alternativa 2: Solicitar todos los permisos al inicio

Al abrir la app por primera vez, se solicitan todos los permisos (cámara, galería, ubicación) en secuencia.

Ventajas:

- Implementación simple: una sola pantalla de permisos.
- Sin verificación por flujo.

Costos:

- Experiencia de usuario negativa: múltiples diálogos al inicio.
- Si el usuario deniega uno, no sabe por qué se lo pedían.
- La app puede parecer intrusiva.
- Los permisos no usados se solicitan innecesariamente.

### Alternativa 3: Verificar permiso sin solicitar

La app verifica si el permiso está concedido y muestra la función grisada si no lo está, pero nunca solicita el permiso.

Ventajas:

- Sin diálogos de permisos.

Costos:

- El usuario debe ir a configuraciones del sistema para conceder el permiso.
- Experiencia de usuario muy degradada.
- La app parece no funcionar.

## Decisión

Se adopta la alternativa 1: solicitud bajo demanda con degradación graceful.

Cada flujo que requiere un permiso:

1. Verifica el estado actual del permiso.
2. Si está disponible, ejecuta la acción.
3. Si no está disponible, solicita el permiso.
4. Si se concede, ejecuta la acción.
5. Si se deniega, muestra un mensaje explicativo y ofrece alternativas.
6. Si se deniega permanentemente, no vuelve a solicitar y muestra instrucciones para ir a configuraciones.

La función `reducePermissionLifecycle` maneja la máquina de estados:

- `granted` → available, resourceActive: true
- `paused` → available, resourceActive: false (el sistema pausó el permiso temporalmente)
- `resumed` → available, resourceActive: true (el sistema restauró el permiso)
- `revoked` → denied, resourceActive: false (el usuario revocó el permiso)
- `denied_permanently` → blocked, resourceActive: false (el usuario denegó permanentemente)

La revocación después de resume se considera denegación permanente porque indica que el usuario cambió de opinión después de haber concedido el permiso.

## Justificación y trade-off

### Facilidad de prueba

`reducePermissionLifecycle` es una función pura: recibe una lista de eventos y retorna un estado. No necesita React Native ni permisos reales. Se puede probar con:

- Secuencias de eventos deterministas.
- Transiciones válidas e inválidas.
- Revocación después de resume.
- Denegación permanente.

### Complejidad

La máquina de estados tiene 5 eventos y 3 estados posibles con `resourceActive`. La complejidad es media pero necesaria para manejar correctamente los casos de revocación y denegación permanente.

Cada flujo de permiso (cámara, galería, ubicación) debe verificar el permiso antes de ejecutar. Esto agrega verificación por flujo, pero se minimiza con un hook o utilidad compartida.

### Cambio de proveedor

La función `reducePermissionLifecycle` es independiente de la plataforma. Si se cambia de Expo a React Native puro, la lógica de estados no cambia. Sólo cambia la API de permisos subyacente (Expo Permissions vs. React Native Permissions).

## Consecuencias

- `reducePermissionLifecycle` debe ser una función pura.
- Cada flujo que requiere permiso debe verificarlo antes de ejecutar.
- La denegación permanente se detecta y se informa al usuario.
- La revocación después de resume se trata como denegación permanente.
- La app no se cierra por permiso denegado: degrada graceful.
- Los permisos se solicitan bajo demanda, no al inicio.
- Cada flujo maneja su propio ciclo de vida de permiso.
- La función retorna `resourceActive: false` cuando el permiso no está disponible.

## Verificación

La prueba de semana 12 (`course-tests/public/week-12.test.ts`) valida:

- Revocación después de resume → denied, resourceActive: false.
- Denegación permanente → blocked, resourceActive: false.
- Secuencias de granted → paused → resumed → available.
- Secuencias de granted → revoked → denied.
