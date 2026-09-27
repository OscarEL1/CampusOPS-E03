# Controles de seguridad y privacidad — semana 04

## Alcance

Estos controles continúan el modelo de amenazas de la semana 03 y usan solamente datos ficticios. La aplicación todavía no autentica usuarios reales: `src/app/composition.ts` conserva un actor fijo mientras ADR-003 sigue en estado propuesto. Esta semana se incorpora el límite de almacenamiento para la futura sesión, se evita publicar un secreto mediante la configuración de Expo y se conserva la sanitización de registros implementada por el equipo.

## Controles implementados

| Amenaza del modelo | Control | Implementación | Verificación reproducible |
|---|---|---|---|
| **T-01: consultar incidencias ajenas** | La futura sesión se representa mediante un puerto de dominio y se persiste en el almacén seguro del sistema, fuera de archivos y preferencias sin cifrar. | `src/campusops/domain/sessionStore.ts`, `src/campusops/infrastructure/secureSessionStore.ts` y `src/app/composition.ts`. | `npm test -- --ci --runInBand course-tests/secure-session-store.test.ts` comprueba guardar, leer y borrar una sesión ficticia, rechazar contenido dañado e inyectar un sustituto en memoria. |
| **T-03: filtrar datos en registros** | La telemetría redacta claves sensibles en objetos y listas; el registro de incidencias usa además una lista de permitidos para no emitir texto libre. | `src/campusops/domain/logRedaction.ts` y `src/campusops/application/incidentLogging.ts`. | `npm run test:negative` ejecuta 13 pruebas negativas, incluidos objetos anidados, listas, errores y el límite conocido sobre texto libre. |
| **T-04: exponer credenciales** | El secreto requerido por herramientas de backend no tiene valor predeterminado ni usa el prefijo público de Expo. La URL, que no es secreta, sí permanece como configuración pública. | `src/config/backendConfig.ts` y `.env.example`. | `npm run test:security` comprueba la ausencia de credenciales rastreadas. `npm test -- --ci --runInBand course-tests/env-exposure.test.ts` impide nombres de secretos bajo `EXPO_PUBLIC_`. |

Los controles de autorización T-01 y T-02 de la semana 03 permanecen activos y se vuelven a comprobar con `npm run test:security`. SecureStore protege la copia local de una futura sesión, pero no sustituye la autorización de cada operación en el servidor.

## Elección de almacenamiento

Se eligió `expo-secure-store` detrás del puerto `SessionStore`. El adaptador serializa una futura sesión —identificador del actor, rol y token de acceso— bajo una sola clave y solicita accesibilidad únicamente con el dispositivo desbloqueado, sin migrarla a otro dispositivo. Si el contenido no es JSON válido o no cumple la forma esperada, se elimina y se devuelve `null`; nunca se convierte en una sesión autenticada.

El puerto mantiene el dominio independiente de Expo y permite sustituir el módulo nativo por memoria o por un mock en Jest. La composición de producción elige `SecureSessionStore`, mientras las pruebas no necesitan un llavero o keystore real. La prueba usa `campus-reporter-demo-401` y `fictional-token-for-storage-test`; no son una identidad ni una credencial reales.

Se descartaron estas alternativas:

- Guardar la sesión como texto en AsyncStorage o en un archivo simplificaría el acceso, pero dejaría el token legible en el almacenamiento de la aplicación.
- Mantener todo únicamente en memoria evitaría una copia persistente, pero obligaría a iniciar sesión después de cada cierre o reinicio.
- Usar directamente `expo-secure-store` desde casos de uso y pantallas reduciría archivos, pero acoplaría el dominio a un módulo nativo y rompería la sustitución controlada en Jest.

El beneficio de SecureStore es delegar la protección en el llavero de iOS o keystore de Android y conservar una interfaz comprobable. El costo es depender de capacidades nativas, aceptar diferencias entre plataformas y manejar valores ausentes o invalidados. La integración actual define el límite y prueba un valor ficticio; el flujo que obtendrá una sesión real corresponde a ADR-003.

## Riesgos residuales

1. **Texto libre en telemetría.** `redactSensitive` decide por nombre de clave y no elimina por sí solo `title` o `description`. Una incidencia cruda conserva la descripción; por eso `logIncidentEvent` construye su salida mediante una lista de permitidos. El límite está demostrado por `logs-limite-del-contrato-sobre-texto-libre` en `reports/week-04/negative-tests.json`.
2. **Dispositivo comprometido o memoria del proceso.** SecureStore reduce la lectura directa de archivos y preferencias, pero no protege un dispositivo con acceso root/jailbreak ni una copia del token que ya esté en memoria durante la ejecución.
3. **Identidad todavía ficticia.** `CURRENT_ACTOR` continúa fijo en la composición y no se carga desde `SessionStore`. Hasta implementar ADR-003, este control demuestra almacenamiento seguro e inyección, no autenticación real ni autorización de extremo a extremo.

Además, un escáner basado en patrones puede omitir formatos de credencial desconocidos. La prueba de nombres públicos complementa el escaneo, pero ninguna de las dos comprobaciones autoriza colocar secretos de backend dentro de una aplicación cliente.
