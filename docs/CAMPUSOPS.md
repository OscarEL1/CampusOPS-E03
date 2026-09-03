# CampusOps — caso común del proyecto integrador

Nombre provisional. Aplicación académica de gestión de incidencias universitarias con React Native, Expo y TypeScript. Se construye progresivamente sobre el starter; este documento no es una aplicación resuelta ni una nueva actividad calificable.

## Problema y límites

Estudiantes y personal ficticios reportan fallas eléctricas, daños en laboratorios, fugas de agua, problemas de conectividad, equipos descompuestos, riesgos de seguridad y necesidades de mantenimiento. El personal responsable clasifica, prioriza, asigna, atiende y cierra los reportes desde la misma aplicación.

Se usa un campus ficticio, cuentas sintéticas, ubicaciones de prueba y fotografías preparadas para el ejercicio. No se capturan personas, credenciales, planos sensibles ni información real de instalaciones. No es un sistema de emergencias ni se despliega como servicio institucional real.

## Perfiles

| Perfil | Funciones |
|---|---|
| Reportante | Crear una incidencia, elegir categoría, describirla, adjuntar fotografías, indicar ubicación, consultar sus reportes y agregar información posterior. |
| Técnico | Consultar incidencias asignadas, iniciar atención, registrar diagnóstico/notas/evidencias, marcar resolución y trabajar sin conexión para sincronizar después. |
| Coordinador | Consultar el conjunto, priorizar, asignar/reasignar técnicos, revisar historial/evidencias, cerrar una resolución o reabrir un caso. |

Una sola app presenta las funciones según el perfil. Ocultar un botón no sustituye comprobar permisos en el servicio. Un técnico no modifica una incidencia que ya fue reasignada a otra persona.

## Flujo de estados

`open` (abierta) → `assigned` (asignada) → `in_progress` (en proceso) → `resolved` (resuelta por el técnico) → `closed` (cerrada por coordinación).

El coordinador puede reabrir un caso resuelto/cerrado hacia `assigned` cuando exista técnico asignado. Cada cambio conserva historial. La interfaz usa etiquetas en español; los identificadores del contrato son estables.

La resolución del técnico y el cierre del coordinador son operaciones diferentes. El ejemplo de respuesta perdida puede aplicarse a cualquiera: repetir la misma operación no debe duplicar eventos, evidencias ni notificaciones.

## Alcance mínimo acumulativo

- Inicio de sesión, cierre y ciclo de sesión seguro con los tres perfiles.
- Lista, detalle y creación de incidencias; categoría, descripción y ubicación.
- Asignación, prioridad, cambios de estado, diagnóstico e historial; reapertura/cierre por coordinación.
- Evidencia fotográfica y notas posteriores, con acceso según perfil.
- Información local consultable, cola persistente de cambios sin conexión y recuperación tras reiniciar la app.
- Sincronización con detección de conflictos, sin pérdida silenciosa de cambios pendientes.
- Un servicio de mapas o geocodificación, con caché y captura manual de ubicación como alternativa.
- Estados de carga, éxito, vacío, error, cancelación, sin conexión y cambio pendiente/conflictivo; recuperación accesible.
- Registros técnicos sanitizados, pruebas y evidencia reproducible.
- APK Android verificable y distribución interna/privada, con preparación documentada para distribución pública.

El mínimo es terminal: no se exige completo en semana 1. Android es la plataforma de referencia. La estructura de pantallas, persistencia y patrones internos se justifican en el ADR del equipo; el stack no se vuelve a elegir.

## Sin conexión, conflicto e idempotencia

El técnico puede consultar lo almacenado, cambiar estado y agregar notas/evidencias en zonas sin cobertura. La cola conserva identidad estable de operación, incidencia, versión base y autor; debe sobrevivir al reinicio. Una foto pendiente debe seguir disponible para su carga posterior, no depender únicamente de una referencia temporal.

Caso obligatorio de conflicto: el técnico inicia atención sin conexión mientras coordinación reasigna la incidencia. Al sincronizar, se conserva la intención pendiente y se informa el conflicto; no se impone el cambio antiguo ni se pierde la nueva asignación. El equipo justifica el mecanismo de resolución y su evidencia. La decisión de cómo presentar y resolver el conflicto pertenece al equipo dentro de estos límites.

Para los adaptadores de evaluación existentes, el campo compuesto `work` agrupa `{ assignedTechnicianId, status }`: cambiar su estado local y su asignación remota constituye un conflicto del mismo campo. Es una representación de prueba, no una obligación sobre el esquema de persistencia de la app.

Un reintento conserva su clave de idempotencia y contenido. Reutilizar una clave con contenido diferente es error, no una segunda operación válida. Sólo se elimina de la cola una operación confirmada; un timeout no prueba que el servidor no la ejecutó.

## Integración externa

Se requiere un servicio de mapas **o** geocodificación; no todos los servicios sugeridos. El equipo documenta proveedor, restricciones y adaptador antes del hito 9, sin introducir pagos o credenciales institucionales. La materia suministra un doble determinista para pruebas de éxito, timeout, 429, datos incompletos/incorrectos y desconexión. Las pruebas de evaluación no dependen de disponibilidad ni cuotas reales de terceros.

El doble de prueba no acredita por sí solo una integración externa real: se conserva evidencia de una ejecución del adaptador contra el servicio elegido con datos sintéticos. Si falla la geocodificación o se niega ubicación, se puede escribir edificio/zona/referencia manualmente. No se exige navegación, seguimiento continuo ni mapas offline completos.

## Privacidad y permisos

- Los logs pueden conservar ID sintético de incidencia, correlación, código de error, intento y duración. Deben ocultar tokens/contraseñas, nombre/identificador personal, correo, ubicación, fotos, comentarios internos e historial de asignaciones.
- Solicitar cámara sólo al fotografiar; ubicación sólo al usar ubicación del dispositivo. No pedir ubicación en segundo plano.
- Preferir selector del sistema para imágenes existentes; no solicitar acceso indiscriminado a archivos/galería.
- Rechazo, revocación o cancelación permiten continuar los flujos que no necesitan ese recurso. Nunca simular que se adjuntó una foto o se obtuvo ubicación.
- Internet es un permiso normal de Android, no un diálogo runtime. La ausencia de conexión es un estado operativo distinto de permiso denegado.
- Push queda fuera del mínimo: si se incorpora voluntariamente, no puede impedir consultar estados desde la app ni exigir permisos al iniciar.

Referencias técnicas: [red Android](https://developer.android.com/develop/connectivity/network-ops/connecting), [selector de fotos](https://developer.android.com/training/data-storage/shared/photo-picker).

## Aplicación a los hitos existentes

| Semana | Contexto CampusOps y evidencia en los entregables existentes |
|---:|---|
| 1 | Delimitar actores, alcance, tres riesgos y flujo reportar→atender; reproducir la línea base y documentar una falla/corrección. No construir toda la app. |
| 2 | ADR y límites entre UI, incidencias, sesión, persistencia y servicios. Esqueleto ejecutable con datos de prueba. |
| 3 | CI y amenazas sobre evidencias, sesión, asignaciones y ubicación; pruebas trazables. |
| 4 | Almacenamiento seguro y sanitización de datos CampusOps; pruebas negativas sin datos reales. |
| 5 | Lista/detalle/creación mediante contratos del backend; validación de respuestas y errores. |
| 6 | Login, perfiles, autorización, expiración, refresh concurrente y logout seguro. |
| 7 | Evaluación parcial y cierre; sin nueva actividad ni función obligatoria. |
| 8 | Persistencia, migración, cola recuperable, sincronización y conflicto por reasignación. |
| 9 | Geocodificación/mapas con alternativa manual, reintentos acotados y operaciones idempotentes. |
| 10 | UI de consulta/atención y estados offline/pendiente/conflicto; observabilidad sin datos sensibles. |
| 11 | Pruebas acumulativas debug/release y diagnóstico de una regresión del flujo de incidencias. |
| 12 | Captura/adjuntos y ubicación con mínimo privilegio, denegación/revocación; build trazable. |
| 13 | Artefacto, hash, notas de versión, distribución interna/privada y dossier con datos sintéticos. |
| 14 | Evaluación parcial y cierre; sin nueva actividad ni función obligatoria. |

Se conservan los enunciados evaluables, dificultad, cinco criterios AC-01..AC-05, rúbricas, gates, entregables y puntos de cada hito. Esta especificación concreta el comportamiento dentro de esos criterios; no crea una calificación adicional. Los conocimientos se acumulan, pero el avance de calendario no acredita dominio.

## Fuera de alcance y extensión voluntaria

No se incorporan pagos, chat en tiempo real, IA/reconocimiento de imágenes, panel web administrativo completo, publicación obligatoria en tiendas, datos reales ni integración con sistemas institucionales reales. Los comentarios e historial existentes no requieren chat.

iOS puede ser una extensión voluntaria una vez probado el núcleo Android y si el equipo dispone del entorno necesario. No sustituye requisitos ni aporta puntos adicionales. Push tampoco es requisito del núcleo. Ninguna extensión desplaza trabajo a las semanas 7 o 14.
