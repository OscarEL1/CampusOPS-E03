# Semana 6 — Mantener una sesión segura aunque fallen varias solicitudes

**Actividad:** Autenticación y ciclo de sesión seguro. **Valor:** 8 puntos. **Equipo:** 3 integrantes.

Disponible del **6 de octubre de 2026 a las 08:00** al **12 de octubre de 2026 a las 23:59**, hora de Ciudad de México.

## El resultado que buscamos

Si varias solicitudes de CampusOps descubren al mismo tiempo que la sesión expiró, no deben renovar la sesión una y otra vez. Esta semana implementarán el inicio, la renovación y el cierre de sesión con comportamiento comprobable.

## Antes de empezar

Continúen con el cliente de incidencias, la validación de datos y los controles de seguridad. Esta entrega cierra antes de la semana 7; no se traslada al periodo de evaluación.

Usen el mismo repositorio y stack: **React Native + Expo + TypeScript**. Instalen el ZIP `week-06-sesion-segura.zip` siguiendo `STARTER_AND_REPOSITORY.md`. Lean el alcance en `docs/CAMPUSOPS.md` y el contrato público en `docs/CAMPUSOPS_API.md`. Mantengan las funciones y controles acumulados: avanzar de semana no permite desactivar lo anterior. Si una dificultad previa les impide continuar, repórtenla al docente con evidencia del problema para recibir apoyo.

## ¿Qué deben hacer?

### 1. Definan los estados de sesión

Representen inicio de sesión, sesión válida, expiración, renovación y cierre. Indiquen cómo se vuelve a un estado no autenticado cuando la renovación falla. El diagrama debe coincidir con el código.

### 2. Apliquen los perfiles de CampusOps

Integren reportante, técnico y coordinador y comprueben la autorización de las operaciones. El técnico resuelve una incidencia asignada; coordinación cierra o reabre. Ocultar botones no sustituye validar permisos. El selector de actor del backend es una ayuda de prueba, no autenticación de producción.

### 3. Coordinen la renovación concurrente

Implementen coordinateRefresh con la lógica real de sesión. Cuando coincidan respuestas 401, debe haber una sola renovación compartida y reintentos limitados. Usen un reloj controlable en las pruebas para verificar expiración sin depender de esperas impredecibles.

### 4. Prueben errores y cierre de sesión

Comprueben renovación fallida u obsoleta, varias solicitudes simultáneas y logout. No deben quedar bucles de renovación, múltiples renovaciones innecesarias ni tokens persistidos después del cierre. Los tokens tampoco deben aparecer en logs.

## Términos que usarán

- **401:** Respuesta que indica que la solicitud no tiene una autenticación válida.
- **Token:** Valor que representa una sesión y debe protegerse.
- **Refresh:** Renovación de la sesión o de su token.
- **Single-flight:** Varias solicitudes comparten una sola operación de renovación en curso.
- **Logout:** Cierre de sesión y eliminación del estado que no debe seguir disponible.

## ¿Qué archivos deben entregar?

Las rutas son relativas a la raíz del repositorio. Además del código y las pruebas del hito, deben quedar estos archivos:

| Archivo | Qué debe contener |
|---|---|
| `docs/session-state-machine.mmd` | Diagrama de estados y transiciones de sesión en Mermaid. |
| `reports/week-06/auth-tests.json` | Pruebas de inicio, expiración, autorización, fallo y cierre de sesión. |
| `reports/week-06/concurrency.json` | Evidencia de solicitudes concurrentes, renovación compartida y reintentos limitados. |
| `evidence/week-06/engineering.json` | Decisión justificada, alternativas, beneficios y costos, requisito y comprobación relacionada. |
| `evidence/week-06/individual.json` | Un registro técnico por integrante; los tres se reúnen en un solo archivo. |

**Decisión que deben justificar:** Justifiquen la política de renovación y la transición segura cuando falla.

El formato de reportes, campos JSON y evidencia individual se explica en `STARTER_AND_REPOSITORY.md` y `docs/EVIDENCE_CONTRACT.md`. No basta con crear archivos vacíos o escribir que las pruebas pasaron: conserven comandos y observaciones reales.

## ¿Cómo comprueban y entregan?

Sigan el orden completo de `STARTER_AND_REPOSITORY.md`: guarden el código, completen evidencias, ejecuten `make feedback`, `make verify-week-06` y `make public-test-week-06`, y guarden el commit exclusivo de reportes/evidencias. Después creen la etiqueta **`week-06-final`** y ejecuten **`make evidence-week-06`**. Ese último comando necesita que la etiqueta ya exista.

Cuando las comprobaciones pasen, suban la versión y la etiqueta a GitHub. En Classroom entreguen **el enlace del repositorio, `week-06-final` y su SHA completo**. El SHA identifica exactamente la versión que se calificará; los cambios posteriores no forman parte de esa entrega. No basta con adjuntar capturas o guardar el proyecto sólo en su computadora.

La guía de entrega también está en el ZIP como `docs/assignments/week-06-repository.md`.

## ¿Cómo se califica?

- **AC-01 — 2.5 puntos:** instalación y verificación reproducibles desde la versión entregada.
- **AC-02 — 2 puntos:** Funcionan login, expiración, renovación compartida y logout, con almacenamiento seguro, reintentos limitados y retorno seguro al estado no autenticado.
- **AC-03 — 1.5 puntos:** Demuestren que no hay bucles ni renovaciones simultáneas duplicadas y que el cierre elimina la sesión persistida.
- **AC-04 — 1.5 puntos:** decisión técnica justificada y relacionada con una prueba y su resultado.
- **AC-05 — 0.5 puntos:** aportación técnica individual verificable y explicación cuando se solicite.

**Total: 8 puntos.** Lean `RUBRIC_PUBLIC.md` para los niveles completo, parcial y sin crédito y para las condiciones que limitan la calificación. El ZIP la incluye en `docs/assignments/week-06-rubric.md`.

## Cómo se obtiene tu calificación

La actividad **no se califica por cantidad de archivos ni por número de commits**. Se suman cinco criterios independientes y el resultado máximo es **8 puntos**:

1. **AC-01 — 2.5 puntos, automático.** Se fija tu tag/SHA y se reproduce el proyecto. El nivel completo requiere instalación y checks obligatorios reproducibles; una deficiencia no crítica reproducible es parcial; sin reproducción o con el check central fallido no hay crédito.
2. **AC-02 — 2 puntos, automático.** Se ejecutan las pruebas públicas y los casos declarados. El nivel completo requiere demostrar el comportamiento completo y sus límites; el nivel parcial significa que el flujo principal funciona pero falla un caso límite. En este hito se busca: Funcionan login, expiración, renovación compartida y logout, con almacenamiento seguro, reintentos limitados y retorno seguro al estado no autenticado.
3. **AC-03 — 1.5 puntos, automático.** Se reproduce la falla declarada y se revisa su manejo. El nivel completo requiere una corrección segura y evidencia útil; evidencia incompleta es parcial; un cierre inesperado, bucle, corrupción o exposición no obtiene crédito. Para esta semana deben demostrar: Demuestren que no hay bucles ni renovaciones simultáneas duplicadas y que el cierre elimina la sesión persistida.
4. **AC-04 — 1.5 puntos, semiautomático.** Se valida `engineering.json` y se contrasta con el repositorio. El nivel completo conecta requisito, alternativas, decisión, trade-off, prueba y resultado; un documento genérico o contradictorio no obtiene crédito. La decisión central es: Justifiquen la política de renovación y la transición segura cuando falla.
5. **AC-05 — 0.5 puntos, semiautomático.** Se revisa `individual.json` y la señal técnica de cada integrante. El nivel completo es una aportación verificable y explicable; una señal limitada pero coherente es parcial; la ausencia de evidencia no obtiene crédito. Los flags y la muestra rotativa sólo activan corroboración: no son un descuento automático.

Los tres primeros criterios suman **6 puntos automáticos** y los dos últimos **2 puntos semiautomáticos**. No hay puntos manuales rutinarios. Los quality gates son límites, no descuentos adicionales; si coinciden varios, se aplica una sola vez el límite más restrictivo. La rúbrica no asigna un porcentaje inventado al nivel parcial: el resultado se determina por la evidencia observada en cada criterio.

GitHub Actions ofrece retroalimentación; la calificación final se obtiene al verificar la versión entregada. No usen secretos ni datos reales, no alteren pruebas para forzar éxito y no sustituyan evidencia ejecutable con capturas. Mantengan las políticas de IA y evidencia individual explicadas en la guía de entrega.

## Antes de cerrar esta semana

- Comprueben el funcionamiento requerido y el caso de falla, no sólo el camino exitoso.
- Revisen que código, documentos y reportes describan la misma versión.
- Confirmen la aportación de los tres integrantes y el envío de etiqueta y SHA.
- Cada integrante debe responder el **quiz semanal 6** por separado: **3 preguntas, 2 puntos**, adicionales a los 8 de esta actividad. Ambos forman parte de la evaluación continua.
