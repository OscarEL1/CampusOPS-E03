# Semana 8 — Conservar el trabajo sin conexión y resolver conflictos

**Actividad:** Persistencia íntegra y sincronización. **Valor:** 8 puntos. **Equipo:** 3 integrantes.

Disponible del **20 de octubre de 2026 a las 08:00** al **26 de octubre de 2026 a las 23:59**, hora de Ciudad de México.

## El resultado que buscamos

Un técnico inicia una atención sin conexión mientras coordinación reasigna la incidencia. Esta semana CampusOps deberá conservar ambos hechos y detectar el conflicto, sin perder cambios ni imponer una asignación antigua.

## Antes de empezar

Partan de la versión de la semana 6 del mismo repositorio. Antes de agregar persistencia, comprueben inicio y cierre de sesión, permisos por perfil y renovación compartida ante varios 401. Conserven esas pruebas durante el Parcial 2. La semana 7 fue de evaluación: no hay un proyecto nuevo ni una funcionalidad intermedia que deban inventar.

Usen el mismo repositorio y stack: **React Native + Expo + TypeScript**. Instalen el ZIP `week-08-persistencia-sincronizacion.zip` siguiendo `STARTER_AND_REPOSITORY.md`. Lean el alcance en `docs/CAMPUSOPS.md` y el contrato público en `docs/CAMPUSOPS_API.md`. Mantengan las funciones y controles acumulados: avanzar de semana no permite desactivar lo anterior. Si una dificultad previa les impide continuar, repórtenla al docente con evidencia del problema para recibir apoyo.

## ¿Qué deben hacer?

### 1. Preparen el caso y el modelo local

Usen incidencias y actores ficticios del contrato público. En docs/data-model.md indiquen qué datos se guardan, dónde se guardan, su versión de esquema y cómo se relacionan. Definan una cola persistente: cada cambio pendiente necesita operationId estable, incidencia, autor, contenido y versión base. Una lista que sólo vive en memoria no cumple este requisito.

### 2. Conserven la cola al reiniciar

Con el técnico asignado, preparen un inicio de atención sin conexión y registren notas o referencias a fotografías pendientes. Cierren y vuelvan a abrir la app; comprueben que recuperan el mismo contenido y la misma identidad de operación. Una referencia de fotografía identifica un recurso pendiente: no demuestra que la imagen ya se haya subido.

### 3. Migren sin dejar datos a medias

Preparen datos de un esquema anterior y migren al nuevo. Verifiquen que se conservan incidencias y operaciones pendientes. Inyecten una falla durante la migración: la transacción debe revertirse o recuperarse de forma controlada, sin dejar parte del esquema nuevo mezclado con el anterior. Registren el estado antes, después de la falla y después de recuperar.

### 4. Reproduzcan la reasignación conflictiva

Partan de una versión base común. El técnico inicia atención localmente sin conexión; mientras tanto, coordinación reasigna la incidencia en el servidor. Al reconectar, detecten la incompatibilidad: no sobrescriban la asignación remota ni borren la intención local. Documenten cómo se informa y resuelve el conflicto, manteniendo la autorización por perfil de la semana 6.

### 5. Integren combinación y deduplicación

Conecten resolveSync y deduplicateOperations con la lógica real de CampusOps. Combinen cambios independientes y reporten los campos incompatibles en orden de nombre, comparando su contenido JSON. work agrupa estado y asignado en las pruebas; no obliga a usar esa estructura en su base. Al repetir operationId, conserven la primera operación sin mutar las entradas.

### 6. Comprueben la sincronización completa

Restablezcan la conexión y repitan una operación con su misma identidad. El servidor no debe aplicar dos veces su efecto. Retiren de la cola sólo lo confirmado; un error o conflicto no autoriza descartarla. Documenten el modelo, la política elegida y los resultados reales en los archivos de esta semana.

## Casos que deben demostrar

Cada fila concreta un requisito de esta semana. Ejecuten los casos con datos ficticios y conserven comando o pasos, resultado esperado y observado. Los reportes deben permitir repetir la comprobación.

| Caso | Cómo provocarlo | Resultado esperado |
|---|---|---|
| Reinicio sin conexión | Crear un cambio pendiente, cerrar y abrir la app. | La cola conserva identidad y contenido; la sesión sigue sus reglas de seguridad. |
| Migración válida y fallida | Migrar datos previos e interrumpir una transacción en otra ejecución. | Se conservan datos y cola; la falla permite volver a un estado íntegro. |
| Reasignación concurrente | Cruzar inicio local de atención y reasignación remota. | Se declara el conflicto y se conservan ambos hechos sin imponer la asignación antigua. |
| Cambios independientes | Modificar campos distintos desde la misma base. | Los cambios compatibles se combinan sin mutar las entradas. |
| Operación repetida | Reenviar la misma operación y simular otra sin confirmación. | Hay un solo efecto; lo no confirmado permanece pendiente. |

Las pruebas públicas verifican parte del contrato; aprobarlas no sustituye la app, la persistencia, los recursos nativos ni la evidencia del flujo real que corresponda al hito. La evaluación docente repite casos declarados sobre el SHA entregado.

## Términos que usarán

- **Persistencia:** Almacenamiento que conserva información después de cerrar o reiniciar la app.
- **Migración:** Cambio de estructura de datos que debe conservar la información existente.
- **Rollback:** Recuperación del estado anterior cuando una operación no puede completarse.
- **Operación atómica:** Operación que se completa entera o no deja un resultado parcial.
- **Idempotencia:** Repetir la misma operación no vuelve a producir su efecto.

## ¿Qué archivos deben entregar?

Las rutas son relativas a la raíz del repositorio. Además del código y las pruebas del hito, deben quedar estos archivos:

| Archivo | Qué debe contener |
|---|---|
| `docs/data-model.md` | Entidades, relaciones, almacenamiento elegido, versión de esquema, estructura de cola y procedimiento de migración/recuperación. |
| `docs/sync-policy.md` | Reglas para combinar o declarar conflictos, autorización, identidad estable, reintento y momento de retirar una operación de la cola. Vinculen la decisión con las pruebas. |
| `reports/week-08/migration-tests.json` | Índice de pruebas de migración correcta/fallida, rollback, reinicio, conflicto, combinación y deduplicación; incluyan comandos y estados observados. |
| `evidence/week-08/engineering.json` | Decisión justificada, alternativas, beneficios y costos, requisito y comprobación relacionada. |
| `evidence/week-08/individual.json` | Un registro técnico por integrante; los tres se reúnen en un solo archivo. |

**Decisión que deben justificar:** Justifiquen la política de conflicto e idempotencia: qué se conserva, qué se combina y qué requiere resolución.

El formato de reportes, campos JSON y evidencia individual se explica en `STARTER_AND_REPOSITORY.md` y `docs/EVIDENCE_CONTRACT.md`. No basta con crear archivos vacíos o escribir que las pruebas pasaron: conserven comandos y observaciones reales.

## ¿Cómo comprueban y entregan?

Sigan el orden completo de `STARTER_AND_REPOSITORY.md`: guarden el código, completen evidencias, ejecuten `make feedback`, `make verify-week-08` y `make public-test-week-08`, y guarden el commit exclusivo de reportes/evidencias. Después creen la etiqueta **`week-08-final`** y ejecuten **`make evidence-week-08`**. Ese último comando necesita que la etiqueta ya exista.

Cuando las comprobaciones pasen, suban la versión y la etiqueta a GitHub. En Classroom entreguen **el enlace del repositorio, `week-08-final` y su SHA completo**. El SHA identifica exactamente la versión que se calificará; los cambios posteriores no forman parte de esa entrega. No basta con adjuntar capturas o guardar el proyecto sólo en su computadora.

La guía de entrega también está en el ZIP como `docs/assignments/week-08-repository.md`.

## Qué pega cada integrante en Classroom

Cada integrante entrega el mismo enlace, etiqueta y SHA del equipo en su tarea, para que quede registro individual. El quiz se responde por separado. Completen este texto con sus datos reales:

```text
Equipo: <identificador registrado>
Repositorio: <enlace de GitHub>
Etiqueta: week-08-final
SHA completo: <40 caracteres del commit etiquetado>
Mi aportación: <cambio técnico y ruta de prueba o revisión>
```

Los tres registros técnicos se reúnen en `evidence/week-08/individual.json`; la línea de Classroom no sustituye ese archivo. Un integrante puede implementar, probar, diagnosticar o revisar, pero debe aportar evidencia técnica propia y comprender lo que entrega.

## ¿Cómo se califica?

- **AC-01 — 2.5 puntos:** instalación y verificación reproducibles desde la versión entregada.
- **AC-02 — 2 puntos:** La migración, la cola persistente, la sincronización y los reintentos preservan integridad; se demuestra recuperación tras reiniciar y conflicto sin pérdida silenciosa.
- **AC-03 — 1.5 puntos:** Demuestren que no se pierden ni duplican datos y que una transacción fallida no deja el estado parcialmente migrado.
- **AC-04 — 1.5 puntos:** decisión técnica justificada y relacionada con una prueba y su resultado.
- **AC-05 — 0.5 puntos:** aportación técnica individual verificable y explicación cuando se solicite.

**Total: 8 puntos.** Lean `RUBRIC_PUBLIC.md` para los niveles completo, parcial y sin crédito y para las condiciones que limitan la calificación. El ZIP la incluye en `docs/assignments/week-08-rubric.md`.

## Cómo se obtiene tu calificación

La actividad **no se califica por cantidad de archivos ni por número de commits**. Se suman cinco criterios independientes y el resultado máximo es **8 puntos**:

1. **AC-01 — 2.5 puntos, automático.** Se fija tu tag/SHA y se reproduce el proyecto. El nivel completo requiere instalación y checks obligatorios reproducibles; una deficiencia no crítica reproducible es parcial; sin reproducción o con el check central fallido no hay crédito.
2. **AC-02 — 2 puntos, automático.** Se ejecutan las pruebas públicas y los casos declarados. El nivel completo requiere demostrar el comportamiento completo y sus límites; el nivel parcial significa que el flujo principal funciona pero falla un caso límite. En este hito se busca: La migración, la cola persistente, la sincronización y los reintentos preservan integridad; se demuestra recuperación tras reiniciar y conflicto sin pérdida silenciosa.
3. **AC-03 — 1.5 puntos, automático.** Se reproduce la falla declarada y se revisa su manejo. El nivel completo requiere una corrección segura y evidencia útil; evidencia incompleta es parcial; un cierre inesperado, bucle, corrupción o exposición no obtiene crédito. Para esta semana deben demostrar: Demuestren que no se pierden ni duplican datos y que una transacción fallida no deja el estado parcialmente migrado.
4. **AC-04 — 1.5 puntos, semiautomático.** Se valida `engineering.json` y se contrasta con el repositorio. El nivel completo conecta requisito, alternativas, decisión, trade-off, prueba y resultado; un documento genérico o contradictorio no obtiene crédito. La decisión central es: Justifiquen la política de conflicto e idempotencia: qué se conserva, qué se combina y qué requiere resolución.
5. **AC-05 — 0.5 puntos, semiautomático.** Se revisa `individual.json` y la señal técnica de cada integrante. El nivel completo es una aportación verificable y explicable; una señal limitada pero coherente es parcial; la ausencia de evidencia no obtiene crédito. Los flags y la muestra rotativa sólo activan corroboración: no son un descuento automático.

Los tres primeros criterios suman **6 puntos automáticos** y los dos últimos **2 puntos semiautomáticos**. No hay puntos manuales rutinarios. Los quality gates son límites, no descuentos adicionales; si coinciden varios, se aplica una sola vez el límite más restrictivo. La rúbrica no asigna un porcentaje inventado al nivel parcial: el resultado se determina por la evidencia observada en cada criterio.

GitHub Actions ofrece retroalimentación; la calificación final se obtiene al verificar la versión entregada. No usen secretos ni datos reales, no alteren pruebas para forzar éxito y no sustituyan evidencia ejecutable con capturas. Mantengan las políticas de IA y evidencia individual explicadas en la guía de entrega.

## Antes de cerrar esta semana

- Comprueben el funcionamiento requerido y el caso de falla, no sólo el camino exitoso.
- Revisen que código, documentos y reportes describan la misma versión.
- Confirmen la aportación de los tres integrantes y el envío de etiqueta y SHA.
- Cada integrante debe responder el **quiz semanal 8** por separado: **3 preguntas, 3 puntos**, adicionales a los 8 de esta actividad. Ambos forman parte de la evaluación continua.
