# Semana 1 — Preparar CampusOps y diagnosticar una falla

**Actividad:** Diagnóstico reproducible y definición técnica. **Valor:** 8 puntos. **Equipo:** 3 integrantes.

Disponible del **1 de septiembre de 2026 a las 08:00** al **7 de septiembre de 2026 a las 23:59**, hora de Ciudad de México.

## El resultado que buscamos

CampusOps permitirá reportar y atender incidencias en una universidad ficticia. Esta semana deben definir el problema, preparar el proyecto y demostrar que saben reproducir, investigar y corregir una falla.

Al terminar, otra persona debe poder descargar la versión que entreguen, instalarla y repetir sus comprobaciones. **No se pide todavía implementar toda la aplicación, sus pantallas ni el inicio de sesión.**

## 1. Preparen el proyecto del equipo

Descarguen `student-starter.zip` y `week-01-diagnostico-reproducible.zip`. Descompriman el primero como proyecto base y copien el contenido del segundo sobre esa misma carpeta: no lo dejen dentro de otra carpeta anidada. Conserven los archivos del proyecto y su historial Git.

Creen **un repositorio público de GitHub para los tres integrantes**. Registren el equipo, las identidades Git, el repositorio y la rama principal siguiendo las indicaciones del docente. Cada integrante debe trabajar con su propia identidad, no con una cuenta compartida.

Necesitan Git, npm, GNU Make, Python 3 y **Node.js 22.22.0**. La versión de Node está indicada en `.nvmrc`. Si utilizan nvm, pueden seleccionarla con `nvm use`. Mantengan las versiones de React Native, Expo y TypeScript incluidas en el starter.

Desde la carpeta que contiene `package.json` y `Makefile`, ejecuten:

```bash
make setup
make feedback
```

El primer comando instala las dependencias fijadas. El segundo revisa tipos, estilo de código, la prueba básica, dependencias críticas y la generación del paquete Android de Expo. **Generar ese paquete no equivale a compilar un APK.**

La prueba básica se llama *smoke test*: comprueba que la base del proyecto funciona. El starter limpio debe pasar `make feedback`. No intenten completar las pruebas de semanas futuras: sus implementaciones todavía están pendientes. El `README.md` del starter explica cómo iniciar el entorno de desarrollo con `make run` y el servidor de datos ficticios con `make run-backend`.

## 2. Definan qué problema van a resolver

Lean `docs/CAMPUSOPS.md` y redacten estos dos archivos dentro del repositorio:

**`docs/problem-definition.md`**

- Expliquen el problema que atiende CampusOps y qué incluye y qué excluye el proyecto.
- Distingan las responsabilidades del reportante, el técnico y el coordinador.
- Describan el recorrido de una incidencia: **reportar → asignar → atender → cerrar**. Aquí lo documentan; no deben implementar todo ese recorrido esta semana.
- Escriban criterios verificables de aceptación: qué tendría que ocurrir para considerar correcto el comportamiento propuesto. Eviten frases que no se puedan comprobar, como “debe funcionar bien”.

**`docs/risk-register.md`**

- Identifiquen **tres riesgos** del proyecto y ordénenlos por prioridad.
- Expliquen su probabilidad, impacto y cómo los reducirían.
- Justifiquen cuál atenderían primero y por qué.

No basta una descripción genérica de cualquier app: las decisiones deben corresponder a CampusOps.

## 3. Reproduzcan, investiguen y corrijan una falla

El proyecto inicial no se entrega roto. Primero comprueben su funcionamiento; después reproduzcan una falla controlada en su copia de trabajo, relacionada con el código o la configuración. No utilicen datos reales ni provoquen daños fuera del proyecto.

1. Registren qué funcionaba antes de introducir la falla.
2. Indiquen qué cambiaron, qué esperaban que sucediera y con qué comando observaron el problema.
3. Investiguen la causa. Distingan el síntoma observado de la causa que lo produce.
4. Corrijan el problema y repitan la comprobación. Conserven evidencia tanto de la ejecución fallida como de la corregida.

Para ejecutar sólo la prueba básica pueden usar `npm run test:smoke`. No borren, alteren, desactiven ni ignoren una prueba para conseguir un resultado exitoso. Al entregar, la versión final debe funcionar y seguir permitiendo reproducir el diagnóstico documentado.

Registren el antes y el después en **`reports/week-01/baseline.json`**. Debe contener observaciones `fail` y `pass`, los comandos utilizados y resultados observables. Una captura puede complementar la explicación, pero no sustituye la evidencia que otra persona pueda ejecutar.

## 4. Expliquen sus decisiones y la aportación de cada integrante

En **`evidence/week-01/engineering.json`**, justifiquen el alcance elegido, el riesgo prioritario y el criterio de aceptación. Comparen al menos dos alternativas distintas, expliquen qué ganan y qué sacrifican con su elección y relacionen la decisión con una comprobación real.

En **`evidence/week-01/individual.json`**, reúnan los registros de **los tres integrantes en un solo archivo**. Cada persona debe identificar su cambio técnico, sus archivos, sus commits y una prueba o revisión asociada; también debe explicar qué esperaba observar, qué comando ejecutó, qué ocurrió y por qué. Tener muchos commits no sustituye demostrar una aportación técnica.

### Formato de los archivos JSON

JSON es un formato estructurado que permite revisar las evidencias con herramientas. Usen los nombres de campo exactos del contrato `docs/EVIDENCE_CONTRACT.md`; para esta entrega, `week` vale `1` y `schemaVersion` vale `1`.

| Archivo | Contenido que deben completar |
|---|---|
| `baseline.json` | `commitSha`, `generatedAt` (fecha y hora ISO 8601) y una lista `checks`. Cada observación incluye `id`, `status`, `scenarioType`, `command` y `evidence`. Usen `pass` para éxito y `fail` para fallo. `scenarioType` admite `nominal` (caso normal), `boundary` (caso límite) o `failure` (falla); debe existir al menos un caso límite o de falla. |
| `engineering.json` | `commitSha`, `decision` (decisión justificada), `alternatives` (al menos dos alternativas), `tradeoff` (beneficio y costo), `requirementIds` (criterios aplicables, de `AC-01` a `AC-05`) y `verification` (lista de comprobaciones con `command`, `result` y `evidence`). |
| `individual.json` | `teamId` (identificador asignado al equipo) y `members` (exactamente tres registros). Cada registro contiene `studentId`, `commitShas`, `files`, `tests`, `reviews`, `prediction`, `command`, `observedResult` y `explanation`. Debe identificar al menos un commit propio y un archivo técnico, y contener al menos una prueba o revisión. |

Usen los identificadores de estudiante y equipo registrados con el docente. `commitShas` contiene códigos Git completos de 40 caracteres; no números inventados. Registren resultados de ejecuciones reales, no resultados esperados presentados como si ya se hubieran obtenido.

## 5. Comprueben la entrega y fijen su versión final

Un **commit** guarda una versión en Git. Su **SHA** es el identificador único de 40 caracteres. Un **tag** es una etiqueta para encontrar una versión; el de esta actividad se llama `week-01-final`.

1. Guarden en Git los cambios de código, configuración y documentos. Consulten su SHA con `git rev-parse HEAD` y úsenlo como `commitSha` de las evidencias correspondientes.
2. Completen los JSON anteriores y ejecuten, desde la raíz del repositorio:

```bash
make feedback
make verify-week-01
make public-test-week-01
```

`verify` comprueba la entrega y el entorno; `public-test` ejecuta las pruebas públicas de la semana y revisa los archivos requeridos. **Estos comandos no redactan por ustedes `baseline.json`, `engineering.json` ni `individual.json`.** Corrijan los errores y vuelvan a comprobar antes de entregar. Si falla un criterio obligatorio, el comando debe informar el fallo, no ocultarlo.

3. Guarden los reportes y evidencias en **un commit final que sólo modifique `reports/` y `evidence/`**. Así pueden documentar el SHA del commit inmediatamente anterior sin crear una referencia imposible al propio archivo. Si después cambian código, configuración o documentos, repitan las comprobaciones y actualicen las evidencias. Un SHA de una versión más antigua no sirve.
4. Revisen `git status --short`: no deben quedar cambios de la entrega sin guardar. Creen la etiqueta local y hagan la comprobación final de evidencias:

```bash
git tag -a week-01-final -m "DMI week 01 final"
make evidence-week-01
```

`make evidence-week-01` valida las evidencias y comprueba que la etiqueta señala la versión actual. Por eso se ejecuta **después de crear la etiqueta**, no antes. Si falla, no envíen todavía la entrega. El comando genera un reporte local de comprobación; no creen otro commit sólo para añadir ese reporte después de fijar la etiqueta.

5. Cuando la comprobación pase, suban la versión y consulten su identificador:

```bash
git push origin HEAD
git push origin week-01-final
git rev-list -n 1 week-01-final
```

El último comando muestra el **SHA final que deben entregar en Classroom**. No lo confundan con el SHA del código anterior al commit exclusivo de evidencias. No sobrescriban una etiqueta ya entregada sin autorización.

En Classroom entreguen el **enlace del repositorio, `week-01-final` y ese SHA completo**. Comprueben que los archivos y la etiqueta están en GitHub, no únicamente en su computadora. Los cambios posteriores al SHA fijado no forman parte de la entrega.

## Lista de comprobación antes de entregar

- Los dos documentos describen CampusOps, sus actores, su flujo crítico y tres riesgos priorizados.
- Los tres JSON contienen evidencias reales y corresponden a la versión entregada.
- Las pruebas muestran tanto la falla investigada como su corrección; las pruebas originales permanecen intactas.
- Las comprobaciones finales pasan y cada integrante tiene una aportación técnica identificable.
- La etiqueta está en GitHub y Classroom contiene enlace, etiqueta y SHA completo.

## Calificación y reglas

La actividad tiene cinco criterios: **AC-01**, reproducción y verificación (2.5); **AC-02**, definición del caso y comportamiento requerido (2); **AC-03**, manejo de la falla (1.5); **AC-04**, decisión respaldada por evidencia (1.5); **AC-05**, evidencia individual (0.5). **Total: 8 puntos.** Consulten `RUBRIC_PUBLIC.md` adjunto para los niveles completo, parcial y sin crédito; el ZIP también la incluye en `docs/assignments/week-01-rubric.md`.

Estas condiciones pueden limitar el resultado: sin SHA o sin reproducción, la parte automática vale 0 y el máximo es **4.8/8**; sin el flujo central requerido, el máximo es **4.8/8**; con un secreto o dato sensible real, el componente de seguridad vale 0, el máximo es **4.8/8** y debe revocarse la credencial expuesta; sin evidencia individual, AC-05 vale 0 y el máximo individual es **5.6/8**. Si coincide más de un límite, se aplica una sola vez el más restrictivo. El flujo central exigido esta semana es el definido arriba, no la aplicación completa.

Los resultados de GitHub Actions son retroalimentación; la calificación final se obtiene al verificar la versión entregada. Si se solicita una explicación individual, deben poder justificar su cambio. Una señal que requiera aclaración no implica por sí sola una penalización.

Usen sólo datos ficticios. No suban secretos, contraseñas ni información personal real del caso. Si dependen de un servicio externo, las comprobaciones deben poder repetirse con una versión simulada de respuestas predecibles. Se permite asistencia de IA: declaren la ayuda material y cómo la verificaron. Siguen siendo responsables de comprender el trabajo, su corrección, seguridad, licencias y pruebas; no se usan detectores de IA para sancionar.

Por separado, cada integrante responde el **Quiz semanal 1 — Reproducibilidad y planeación**: exactamente **3 preguntas**, máximo **2 puntos**. No se responde en el repositorio.
