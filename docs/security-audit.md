# Auditoría de seguridad — Semana 4

## Alcance

Esta auditoría revisa la configuración del cliente Expo y el backend académico de CampusOps. Todos los usuarios, ubicaciones y tokens mencionados en el proyecto son datos ficticios de prueba.

La auditoría se realizó sobre la rama `week4/security-audit-AlejandroContreras`. Se documentaron tres hallazgos y se corrigieron y verificaron los dos seleccionados como obligatorios.

## Hallazgos

| # | Hallazgo | Riesgo | Solución aplicada o propuesta | Estado y evidencia |
|---|---|---|---|---|
| 1 | Una configuración denominada `EXPO_PUBLIC_API_SECRET` se consultaba desde el cliente | Las variables `EXPO_PUBLIC_*` se incorporan al paquete de la aplicación y pueden ser inspeccionadas; por ello no pueden proteger secretos | Se eliminó la variable del ejemplo, se retiró del cliente el módulo que intentaba leerla y se reforzó el escaneo para revisar también `.env.example` | Corregido; comprobación de tipos y 12 pruebas de seguridad aprobadas |
| 2 | El backend respondía con `Access-Control-Allow-Origin: *` | Si el servicio se expone fuera del entorno controlado, cualquier origen web podría intentar consumir sus rutas | Se sustituyó el comodín por una lista explícita configurable y se rechazan los preflight de orígenes no autorizados | Corregido; prueba integral del backend aprobada |
| 3 | El backend de prueba utiliza un token público y recibe la identidad mediante `X-Course-Actor` | Un consumidor que conozca los valores ficticios puede seleccionar otro actor, incluso uno con mayores privilegios; este diseño no autentica una identidad real | Mantener el servidor limitado al entorno académico y, antes de cualquier despliegue real, sustituir el fixture por sesiones que vinculen la identidad y el rol del usuario | Pendiente; el propio proyecto declara que el backend es un fixture no apto para producción |

## Hallazgo 1 — Secreto declarado como variable pública del cliente

### Problema encontrado

El archivo `.env.example` declara `EXPO_PUBLIC_API_SECRET` y `src/config/backendConfig.ts` intenta leerlo desde `process.env.EXPO_PUBLIC_API_SECRET`.

### Riesgo

Expo utiliza el prefijo `EXPO_PUBLIC_` para valores que deben estar disponibles en el cliente. Un valor secreto colocado allí puede terminar dentro del paquete distribuido y ser recuperado por cualquier persona que lo inspeccione. El hecho de que el archivo `.env` no se suba a Git evita una filtración en el repositorio, pero no evita la exposición dentro de la aplicación compilada.

### Solución aplicada

Se eliminó `EXPO_PUBLIC_API_SECRET` de `.env.example` y se retiró `src/config/backendConfig.ts`, ya que no tenía consumidores de producción y su única función era intentar obtener un secreto desde el paquete cliente. Si un servicio externo necesita una credencial privada, deberá utilizarla únicamente un backend de confianza y entregar al cliente sólo los resultados autorizados.

La prueba T-04 dejó de excluir `.env.example` del escaneo de archivos rastreados. Además, comprueba expresamente que el ejemplo de entorno no declare variables públicas cuyos nombres indiquen secretos, claves privadas o tokens de acceso.

### Evidencia inicial

- `.env.example`: declaración de `EXPO_PUBLIC_API_SECRET` sin valor real.
- `src/config/backendConfig.ts`: lectura de `process.env.EXPO_PUBLIC_API_SECRET`.
- `README.md`: indica que los valores `EXPO_PUBLIC_*` son visibles en el cliente y no deben contener secretos.

### Evidencia de la corrección

- `docs/evidence/hallazgo-1-configuracion-publica.md` describe la comprobación estática y el cambio realizado.
- `docs/evidence/hallazgo-1-prueba-seguridad.txt` conserva la salida relevante de la comprobación de tipos y de la prueba automática.
- El escaneo estático no encontró configuraciones `EXPO_PUBLIC_*` con nombres de secreto en `.env.example`, `src` ni `App.tsx`.
- No quedaron referencias activas a `backendConfig`, `readBackendApiSecret` ni `getBackendApiSecret`.
- `npm run typecheck` terminó con código de salida 0.
- `npm run test:security` terminó con código de salida 0: 1 suite y 12 pruebas aprobadas. Las dos comprobaciones T-04 confirman que `.env.example` no declara un secreto público y que los archivos rastreados no coinciden con los patrones de credenciales conocidos.

### Estado

Corregido y verificado.

## Hallazgo 2 — Política CORS abierta

### Problema encontrado

La función `send` de `course-backend/server.mjs` agrega `Access-Control-Allow-Origin: *` a todas las respuestas.

### Riesgo

La política permite que cualquier origen web intente leer las respuestas del backend. El impacto actual está limitado porque el servidor se inicia en `127.0.0.1` y contiene únicamente datos ficticios, pero el control sería insuficiente si posteriormente se configurara para escuchar en una interfaz de red o se reutilizara con información real.

### Solución aplicada

Se eliminó el comodín y se agregó la variable de servidor `COURSE_BACKEND_ALLOWED_ORIGINS`, que acepta una lista de orígenes separada por comas. El backend sólo devuelve `Access-Control-Allow-Origin` cuando el origen recibido pertenece a esa lista.

Los preflight de orígenes no autorizados reciben estado 403. Las solicitudes sin encabezado `Origin`, utilizadas por React Native y por clientes no basados en navegador, continúan funcionando sin recibir encabezados CORS.

### Evidencia inicial

- `course-backend/server.mjs`: encabezado `access-control-allow-origin` configurado con `*`.
- `course-backend/server.mjs`: el host puede configurarse mediante `COURSE_BACKEND_HOST`.

### Evidencia de la corrección

- `docs/evidence/hallazgo-2-cors-restringido.md` describe el cambio y los casos comprobados.
- `docs/evidence/hallazgo-2-prueba-backend.txt` conserva la salida relevante de la prueba integral.
- `npm run backend:self-test` terminó con código de salida 0.
- La prueba confirmó que el origen permitido recibe su encabezado, el origen no autorizado no lo recibe y su preflight es rechazado.
- `npm run typecheck` y `npm run test:security` también terminaron con código de salida 0 después de la corrección.

### Estado

Corregido y verificado.

## Hallazgo 3 — Identidad controlada por el cliente en el fixture académico

### Problema encontrado

El endpoint de inicio de sesión acepta uno de los identificadores públicos de prueba y devuelve un token fijo. Las demás rutas reciben por separado el identificador del actor mediante `X-Course-Actor`.

### Riesgo

El token no está vinculado criptográficamente con el actor ni con su rol. Por lo tanto, una persona que pueda comunicarse con el servidor puede seleccionar cualquiera de los actores ficticios, incluido el coordinador. Este comportamiento está diseñado para pruebas académicas, pero no proporciona autenticación real.

### Solución propuesta

Conservar el backend limitado a datos ficticios, a la interfaz local y al entorno académico. Para un despliegue real se necesitaría autenticar al usuario y obtener su identidad y rol desde una sesión validada en el servidor, sin aceptar esa autoridad desde un encabezado controlado por el cliente.

### Evidencia inicial

- `course-backend/campusops.mjs`: token fijo y lectura de `X-Course-Actor`.
- `docs/CAMPUSOPS_API.md`: declara expresamente que los valores son fixtures públicos y no autenticación de producción.
- `README.md`: limita el backend a desarrollo.

### Estado

Pendiente. Por ahora se documenta el riesgo y el límite de uso; todavía no se ha seleccionado como una de las dos correcciones obligatorias.

## Comprobación del repositorio

- La rama activa corresponde a la actividad de la Semana 4.
- `.gitignore` contiene la entrada `.env`.
- `.env` no está rastreado por Git.
- `.env.example` está rastreado y no contiene valores de credenciales reales.
- Los dos problemas seleccionados fueron corregidos y sus pruebas terminaron correctamente.

## Evidencias

Las evidencias verificables se guardaron en `docs/evidence/` mediante documentos explicativos y salidas reproducibles de las pruebas. No se incluyeron contraseñas, tokens, credenciales ni datos personales reales.

## Comprobación final

Se ejecutó:

```bash
git status
```

El resultado mostró únicamente los archivos esperados de la auditoría. `git check-ignore -v .env` confirmó que `.env` permanece excluido por `.gitignore`. Además, finalizaron correctamente:

- `npm run backend:self-test`;
- `npm run typecheck`;
- `npm run test:security`;
- `npm run lint`.

La documentación y las evidencias utilizan exclusivamente datos ficticios de prueba.
