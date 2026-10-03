# Semana 5 — Conectar CampusOps al backend y validar sus respuestas

**Actividad:** Cliente cloud gobernado por contrato. **Valor:** 8 puntos. **Equipo:** 3 integrantes.

Disponible del **29 de septiembre de 2026 a las 08:00** al **5 de octubre de 2026 a las 23:59**, hora de Ciudad de México.

## El resultado que buscamos

El servidor puede responder correctamente, tardar demasiado o devolver datos incompletos. Esta semana conectarán la consulta y creación de incidencias sin dejar que una respuesta inválida rompa la aplicación.

## Antes de empezar

Respeten la separación de arquitectura y los controles de almacenamiento, registros y errores de las semanas anteriores.

Usen el mismo repositorio y stack: **React Native + Expo + TypeScript**. Instalen el ZIP `week-05-cliente-cloud.zip` siguiendo `STARTER_AND_REPOSITORY.md`. Lean el alcance en `docs/CAMPUSOPS.md` y el contrato público en `docs/CAMPUSOPS_API.md`. Mantengan las funciones y controles acumulados: avanzar de semana no permite desactivar lo anterior. Si una dificultad previa les impide continuar, repórtenla al docente con evidencia del problema para recibir apoyo.

## ¿Qué deben hacer?

### 1. Documenten el contrato de datos

Definan qué datos envían y reciben al consultar lista, detalle y crear incidencias. Lean docs/CAMPUSOPS_API.md y course-backend/README.md. Distingan los datos recibidos del servidor de los objetos que utiliza la aplicación.

### 2. Implementen el cliente separado de la interfaz

Conecten el flujo al backend didáctico mediante una capa de cliente. No hagan llamadas HTTP directamente desde las pantallas. Implementen parseRemoteResource con la lógica compartida del proyecto y validen los datos antes de usarlos.

### 3. Distingan datos vacíos, inválidos y errores

Comprueben la respuesta válida, el payload nulo permitido, un objeto malformado, timeout y error 500. Un payload nulo válido no permite inventar datos ni debe confundirse con un formato inválido. Representen los errores con tipos distinguibles y no dejen excepciones sin controlar.

### 4. Repitan las pruebas sin Internet público

Usen las variantes del backend y respuestas simuladas predecibles para reproducir éxito, lentitud y fallo. Registren el resultado esperado y observado; los logs deben seguir sanitizados y el cliente no debe depender del proveedor real para aprobar sus pruebas.

## Términos que usarán

- **Backend:** Servicio que recibe solicitudes y administra los datos de CampusOps.
- **DTO:** Estructura utilizada para transferir datos entre el servidor y la app.
- **Payload:** Contenido de datos de una solicitud o respuesta.
- **Timeout:** Límite de espera tras el cual la app deja de esperar una respuesta.
- **Stub o doble de prueba:** Sustituto controlado de un servicio para obtener respuestas repetibles.

## ¿Qué archivos deben entregar?

Las rutas son relativas a la raíz del repositorio. Además del código y las pruebas del hito, deben quedar estos archivos:

| Archivo | Qué debe contener |
|---|---|
| `docs/api-contract.md` | Contrato de solicitudes, respuestas, validación y representación de errores. |
| `reports/week-05/contract-tests.json` | Pruebas del contrato y de la separación entre datos remotos y datos de la aplicación. |
| `reports/week-05/failure-matrix.json` | Casos de respuesta inválida, timeout y error de servidor, con resultados observados. |
| `evidence/week-05/engineering.json` | Decisión justificada, alternativas, beneficios y costos, requisito y comprobación relacionada. |
| `evidence/week-05/individual.json` | Un registro técnico por integrante; los tres se reúnen en un solo archivo. |

**Decisión que deben justificar:** Justifiquen el límite entre DTO, datos del dominio y representación de errores.

El formato de reportes, campos JSON y evidencia individual se explica en `STARTER_AND_REPOSITORY.md` y `docs/EVIDENCE_CONTRACT.md`. No basta con crear archivos vacíos o escribir que las pruebas pasaron: conserven comandos y observaciones reales.

## ¿Cómo comprueban y entregan?

Sigan el orden completo de `STARTER_AND_REPOSITORY.md`: guarden el código, completen evidencias, ejecuten `make feedback`, `make verify-week-05` y `make public-test-week-05`, y guarden el commit exclusivo de reportes/evidencias. Después creen la etiqueta **`week-05-final`** y ejecuten **`make evidence-week-05`**. Ese último comando necesita que la etiqueta ya exista.

Cuando las comprobaciones pasen, suban la versión y la etiqueta a GitHub. En Classroom entreguen **el enlace del repositorio, `week-05-final` y su SHA completo**. El SHA identifica exactamente la versión que se calificará; los cambios posteriores no forman parte de esa entrega. No basta con adjuntar capturas o guardar el proyecto sólo en su computadora.

La guía de entrega también está en el ZIP como `docs/assignments/week-05-repository.md`.

## ¿Cómo se califica?

- **AC-01 — 2.5 puntos:** instalación y verificación reproducibles desde la versión entregada.
- **AC-02 — 2 puntos:** La consulta y creación funcionan mediante el cliente; se distinguen payload inválido, timeout y error del servidor, sin HTTP directo desde la UI ni logs sensibles.
- **AC-03 — 1.5 puntos:** Demuestren que el cliente rechaza datos corruptos, controla las excepciones y puede probarse sin depender de un servicio real.
- **AC-04 — 1.5 puntos:** decisión técnica justificada y relacionada con una prueba y su resultado.
- **AC-05 — 0.5 puntos:** aportación técnica individual verificable y explicación cuando se solicite.

**Total: 8 puntos.** Lean `RUBRIC_PUBLIC.md` para los niveles completo, parcial y sin crédito y para las condiciones que limitan la calificación. El ZIP la incluye en `docs/assignments/week-05-rubric.md`.

## Cómo se obtiene tu calificación

La actividad **no se califica por cantidad de archivos ni por número de commits**. Se suman cinco criterios independientes y el resultado máximo es **8 puntos**:

1. **AC-01 — 2.5 puntos, automático.** Se fija tu tag/SHA y se reproduce el proyecto. El nivel completo requiere instalación y checks obligatorios reproducibles; una deficiencia no crítica reproducible es parcial; sin reproducción o con el check central fallido no hay crédito.
2. **AC-02 — 2 puntos, automático.** Se ejecutan las pruebas públicas y los casos declarados. El nivel completo requiere demostrar el comportamiento completo y sus límites; el nivel parcial significa que el flujo principal funciona pero falla un caso límite. En este hito se busca: La consulta y creación funcionan mediante el cliente; se distinguen payload inválido, timeout y error del servidor, sin HTTP directo desde la UI ni logs sensibles.
3. **AC-03 — 1.5 puntos, automático.** Se reproduce la falla declarada y se revisa su manejo. El nivel completo requiere una corrección segura y evidencia útil; evidencia incompleta es parcial; un cierre inesperado, bucle, corrupción o exposición no obtiene crédito. Para esta semana deben demostrar: Demuestren que el cliente rechaza datos corruptos, controla las excepciones y puede probarse sin depender de un servicio real.
4. **AC-04 — 1.5 puntos, semiautomático.** Se valida `engineering.json` y se contrasta con el repositorio. El nivel completo conecta requisito, alternativas, decisión, trade-off, prueba y resultado; un documento genérico o contradictorio no obtiene crédito. La decisión central es: Justifiquen el límite entre DTO, datos del dominio y representación de errores.
5. **AC-05 — 0.5 puntos, semiautomático.** Se revisa `individual.json` y la señal técnica de cada integrante. El nivel completo es una aportación verificable y explicable; una señal limitada pero coherente es parcial; la ausencia de evidencia no obtiene crédito. Los flags y la muestra rotativa sólo activan corroboración: no son un descuento automático.

Los tres primeros criterios suman **6 puntos automáticos** y los dos últimos **2 puntos semiautomáticos**. No hay puntos manuales rutinarios. Los quality gates son límites, no descuentos adicionales; si coinciden varios, se aplica una sola vez el límite más restrictivo. La rúbrica no asigna un porcentaje inventado al nivel parcial: el resultado se determina por la evidencia observada en cada criterio.

GitHub Actions ofrece retroalimentación; la calificación final se obtiene al verificar la versión entregada. No usen secretos ni datos reales, no alteren pruebas para forzar éxito y no sustituyan evidencia ejecutable con capturas. Mantengan las políticas de IA y evidencia individual explicadas en la guía de entrega.

## Antes de cerrar esta semana

- Comprueben el funcionamiento requerido y el caso de falla, no sólo el camino exitoso.
- Revisen que código, documentos y reportes describan la misma versión.
- Confirmen la aportación de los tres integrantes y el envío de etiqueta y SHA.
- Cada integrante debe responder el **quiz semanal 5** por separado: **3 preguntas, 2 puntos**, adicionales a los 8 de esta actividad. Ambos forman parte de la evaluación continua.
