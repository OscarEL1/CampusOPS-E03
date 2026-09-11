# ADR-001: Arquitectura interna de CampusOps

- Estado: aceptada
- Fecha: 2026-09-10
- Alcance: Semana 02

## Contexto

CampusOps debe crecer para atender incidencias desde una aplicación React Native con
Expo y TypeScript. La aplicación tendrá funciones distintas para los perfiles
Reportante, Técnico y Coordinación, e incorporará sesión, persistencia y un proveedor
de ubicación. Estos detalles cambiarán durante el curso, por lo que las reglas de
negocio no deben quedar ligadas a React Native, al almacenamiento ni a un proveedor
externo.

El esqueleto actual ya incluye las pantallas `IncidentListScreen` e
`IncidentDetailScreen`, los casos de consulta creados por `createIncidentQueries`, el
contrato `IncidentRepository` y el adaptador determinista
`InMemoryIncidentRepository`. El archivo `src/app/composition.ts` ensambla esas
dependencias.

## Alternativas consideradas

### Alternativa 1: capas con puertos y adaptadores

Separar el sistema en UI, application, domain e infrastructure. El dominio define las
entidades y los contratos que necesita, application coordina los casos de uso,
infrastructure implementa los contratos y el punto de composición selecciona las
implementaciones concretas. La UI recibe datos y operaciones sin importar directamente
adaptadores de infraestructura.

Esta alternativa requiere más interfaces y ensamblaje inicial, pero permite sustituir
un repositorio en memoria por persistencia local o remota y reemplazar proveedores de
sesión o ubicación sin reescribir las pantallas ni las reglas del dominio.

### Alternativa 2: UI conectada directamente a servicios y almacenamiento

Permitir que cada pantalla importe el cliente HTTP, el almacenamiento y el proveedor
de ubicación que necesite. El inicio es más corto y requiere menos archivos, pero las
decisiones externas se dispersan en la UI. Las pruebas necesitan preparar detalles de
React Native y de cada proveedor, y un cambio de almacenamiento o geocodificación
obliga a modificar varias pantallas.

## Decisión

Se adopta la alternativa 1: arquitectura por capas con puertos y adaptadores. Las
dependencias del código se dirigen hacia contratos estables:

- UI presenta el estado y solicita operaciones de application.
- Application implementa los casos de uso y depende de contratos del domain.
- Domain contiene modelos y puertos sin depender de UI o infrastructure.
- Infrastructure implementa los puertos para persistencia y proveedores externos.
- `src/app/composition.ts` es la raíz de composición y puede conocer tanto los casos de
  uso como las implementaciones concretas para conectarlos.

En el esqueleto de incidencias, `IncidentRepository` es el puerto del dominio,
`createIncidentQueries` construye los casos de uso de lista y detalle, e
`InMemoryIncidentRepository` es el adaptador reemplazable. Aunque las pantallas usan
el tipo `Incident` para renderizar datos, no importan
`InMemoryIncidentRepository` ni ningún otro elemento de infrastructure.

Los límites de sesión, persistencia y ubicación se documentan ahora como extensiones
previstas, no como funciones ya implementadas. Seguirán la misma dirección: los casos
de uso dependerán de puertos del dominio y las integraciones concretas quedarán en
infrastructure.

## Justificación y trade-off

### Facilidad de prueba

Los casos de uso pueden probarse con implementaciones controladas de
`IncidentRepository`, sin montar pantallas ni acceder a red o disco. La UI también se
puede probar con datos y callbacks. La prueba de límites inspecciona los imports de
`src/campusops/ui` y falla si aparece una dependencia directa hacia infrastructure.

### Complejidad

La separación introduce contratos, carpetas y una raíz de composición, lo cual tiene
un costo mayor que importar servicios directamente. Se acepta ese costo porque cada
capa mantiene una responsabilidad concreta y el alcance crecerá durante varias
semanas. No se crearán abstracciones para funciones futuras hasta que exista un caso de
uso que las necesite.

### Cambio de proveedor

Cambiar el repositorio en memoria por una base local, una API o una estrategia híbrida
requiere implementar el mismo puerto y modificar el ensamblaje. El mismo criterio se
aplicará a sesión y ubicación. Así se concentra el costo del cambio en infrastructure
y en la composición, en lugar de propagarlo por las pantallas.

## Consecuencias

- Las dependencias concretas se crean en una raíz de composición explícita.
- La UI no puede importar módulos de infrastructure directamente.
- Los adaptadores deben respetar contratos definidos hacia el interior del sistema.
- Las pruebas pueden usar dobles deterministas y observar casos nominales, de límite y
  de falla.
- Agregar una capacidad requiere decidir a qué límite pertenece y puede añadir archivos
  de ensamblaje.
- El diagrama y las pruebas de arquitectura deben actualizarse si cambian los nombres o
  las dependencias reales.

## Comprobación de la decisión

La regla principal se comprueba mediante
`course-tests/architecture-boundaries.test.ts`, que revisa que los archivos de UI no
contengan imports hacia infrastructure. La prueba pública de Semana 02 comprueba además
que el diagrama incluya los cuatro límites y que no declare una dependencia directa de
UI a infrastructure.

