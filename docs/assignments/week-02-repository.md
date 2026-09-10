# Semana 2 — Preparar el repositorio y entregar la versión final

## Continúen sobre el mismo proyecto

Trabajen en el **mismo repositorio público de GitHub y equipo de 3 integrantes**. No creen otro repositorio ni vuelvan a instalar el starter encima de su código. Conserven React Native, Expo y TypeScript con las versiones fijadas y Node.js 22.22.0; necesitan también npm, Git, GNU Make y Python 3. Cada integrante utiliza su identidad Git registrada con el docente.

1. Integren los cambios del equipo en la rama principal registrada y revisen que no se pierda trabajo local.
2. Descarguen `week-02-arquitectura-justificable.zip` y copien su contenido sobre la raíz del repositorio, combinando carpetas. Incluyan `.github`, aunque el explorador la muestre oculta. No borren el historial ni archivos ajenos al paquete; revisen cualquier conflicto antes de sobrescribir trabajo propio.
3. Lean `ACTIVITY_STUDENT_FACING.md`. En el ZIP está también en `docs/assignments/week-02.md`, junto con esta guía en `docs/assignments/week-02-repository.md` y la rúbrica en `docs/assignments/week-02-rubric.md`.
4. Desde la carpeta que contiene `package.json` y `Makefile`, ejecuten `make setup`. Si usan nvm, seleccionen primero la versión con `nvm use`. Los requisitos de Android nativo están en el `README.md` del starter; no cambien versiones para ocultar un fallo de entorno.

## Completen las evidencias de esta semana

Los documentos y reportes específicos aparecen en la guía de la actividad. Los JSON no son textos libres: los campos obligatorios se enumeran a continuación. Creen las carpetas indicadas si no existen. Para esta entrega, **`schemaVersion` es `1` y `week` es `2`**.

- **Reportes JSON:** incluyan `commitSha`, `generatedAt` (fecha y hora ISO 8601) y `checks`. Cada observación lleva `id`, `status`, `scenarioType`, `command` y `evidence`. `status` admite `pass`, `fail` o `not_applicable`; `scenarioType` admite `nominal` (normal), `boundary` (límite) o `failure` (falla). Cada reporte debe incluir al menos un caso límite o de falla, con comando y resultado real. Conserven además los campos particulares exigidos para esta semana.
- **`evidence/week-02/engineering.json`:** registren `commitSha`, `decision`, al menos dos `alternatives` distintas, `tradeoff` (beneficio y costo), `requirementIds` de `AC-01` a `AC-05`, y `verification`. Cada comprobación contiene `command`, `result` y `evidence`. La decisión debe corresponder al código, no ser una explicación genérica.
- **`evidence/week-02/individual.json`:** un solo archivo del equipo con `teamId` y exactamente tres registros en `members`. Cada integrante completa `studentId`, `commitShas`, `files`, `tests`, `reviews`, `prediction`, `command`, `observedResult` y `explanation`. Identifiquen al menos un commit propio, un archivo técnico y una prueba o revisión. Usen los identificadores registrados, no datos inventados ni una identidad compartida.

Los comandos verifican estas evidencias; **no redactan por ustedes los reportes ni las justificaciones**. No presenten resultados esperados como si ya hubieran ejecutado la prueba.

## Orden de comprobación y entrega

Un **commit** guarda una versión del proyecto. Su **SHA** es el identificador Git de 40 caracteres. Un **tag** es una etiqueta que señala una versión; esta semana se llama **`week-02-final`**.

1. Guarden en Git los cambios de código, configuración y documentos. Consulten `git rev-parse HEAD` y usen ese SHA en los reportes y evidencias de la versión comprobada.
2. Completen las evidencias y ejecuten:

```bash
make feedback
make verify-week-02
make public-test-week-02
```

`feedback` revisa tipos, estilo, prueba básica, dependencias críticas y generación del paquete Android de Expo. `verify` realiza las comprobaciones del hito; `public-test` ejecuta las pruebas públicas y revisa los archivos requeridos. Un fallo obligatorio debe producir un resultado de error, no ocultarse. El paquete de Expo no equivale por sí solo a un APK ni a una prueba de instalación.

3. Guarden los reportes y evidencias en **un commit final que sólo modifique `reports/` y `evidence/`**. Los campos `commitSha` pueden referirse al SHA final o al commit inmediatamente anterior si el último contiene exclusivamente evidencias. Si cambian código, configuración, documentos o artefactos, vuelvan a comprobar y actualicen los reportes; no sirve un SHA más antiguo.
4. Revisen `git status --short`: no debe quedar trabajo de la entrega sin guardar. Creen la etiqueta local y comprueben las evidencias:

```bash
git tag -a week-02-final -m "DMI week 02 final"
make evidence-week-02
```

`evidence` verifica los JSON y que la etiqueta corresponda a la versión actual; por eso se ejecuta **después de crearla**. Si falla, no envíen la entrega. El reporte generado en esta última comprobación se conserva localmente: no creen otro commit sólo para añadirlo después de fijar la etiqueta.

5. Cuando las comprobaciones pasen, suban el trabajo y consulten el SHA de entrega:

```bash
git push origin HEAD
git push origin week-02-final
git rev-list -n 1 week-02-final
```

En Classroom entreguen **enlace del repositorio, etiqueta y el SHA completo del último comando**. Comprueben que la etiqueta y los archivos están en GitHub, no sólo en su computadora. No sobrescriban una etiqueta ya entregada sin autorización. Los cambios posteriores al SHA fijado no forman parte de la entrega.

## Reglas que siguen vigentes

Conserven las pruebas anteriores que correspondan al avance del proyecto; no intenten aprobar funciones de semanas futuras con respuestas simuladas. Los adaptadores de `src/course-evaluation/index.ts` deben llamar a la lógica real de la app. Los servicios externos se prueban también con sustitutos controlados y respuestas repetibles.

No modifiquen pruebas o workflows para ocultar errores. Usen sólo datos ficticios; no suban credenciales, contraseñas ni claves de firma. Las capturas complementan, pero no sustituyen, evidencia ejecutable o inspeccionable. Se permite asistencia de IA: declaren la ayuda material y cómo la verificaron. Deben comprender su trabajo y responder por corrección, seguridad, licencias y pruebas; no se usan detectores de IA para sancionar.
