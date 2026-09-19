# Semana 3 — Automatizar las comprobaciones e identificar amenazas

**Actividad:** Integración continua y modelo de amenazas inicial. **Valor:** 8 puntos. **Equipo:** 3 integrantes.

Disponible del **15 de septiembre de 2026 a las 08:00** al **21 de septiembre de 2026 a las 23:59**, hora de Ciudad de México.

## El resultado que buscamos

CampusOps manejará sesiones, fotografías, ubicaciones y asignaciones. Esta semana harán que GitHub revise el proyecto automáticamente y relacionarán los riesgos de seguridad con controles y pruebas concretas.

## Antes de empezar

Conserven el alcance, la arquitectura y el historial de las semanas anteriores. Las comprobaciones deben ejecutarse sobre el proyecto real, no sobre una demostración separada.

Usen el mismo repositorio y stack: **React Native + Expo + TypeScript**. Instalen el ZIP `week-03-ci-amenazas.zip` siguiendo `STARTER_AND_REPOSITORY.md`. Lean el alcance en `docs/CAMPUSOPS.md` y el contrato público en `docs/CAMPUSOPS_API.md`. Mantengan las funciones y controles acumulados: avanzar de semana no permite desactivar lo anterior. Si una dificultad previa les impide continuar, repórtenla al docente con evidencia del problema para recibir apoyo.

## ¿Qué deben hacer?

### 1. Comprueben el flujo de GitHub Actions

Usen el workflow incluido para instalar las dependencias fijadas y ejecutar generación del paquete, revisión de tipos, estilo, pruebas y búsqueda de secretos. Debe conservar reportes como artefactos descargables y tener sólo los permisos necesarios.

### 2. Describan qué deben proteger

En el modelo de amenazas, identifiquen activos, fronteras de confianza y amenazas priorizadas: consultar incidencias ajenas, alterar asignaciones, filtrar datos en registros o exponer credenciales. Usen únicamente datos ficticios.

### 3. Conecten cada riesgo con una comprobación

Para cada riesgo priorizado, indiquen qué control lo reduce y con qué prueba lo verificarán. Justifiquen la prioridad y el riesgo que permanece. Una lista de amenazas sin controles verificables no basta.

### 4. Demuestren que las comprobaciones detectan fallos

Verifiquen que un incumplimiento obligatorio hace fallar el proceso y genera evidencia útil. No desactiven comprobaciones, no ignoren códigos de error ni conviertan pruebas ausentes en un éxito. Conserven el diagnóstico y el resultado corregido.

## Términos que usarán

- **CI:** Integración continua: comprobaciones automáticas del proyecto cuando se integran cambios.
- **Workflow:** Archivo que indica a GitHub Actions qué pasos debe ejecutar.
- **Frontera de confianza:** Punto donde los datos pasan entre componentes con permisos o confianza diferentes.
- **Artefacto de CI:** Archivo de resultados que se conserva al terminar una ejecución.

## ¿Qué archivos deben entregar?

Las rutas son relativas a la raíz del repositorio. Además del código y las pruebas del hito, deben quedar estos archivos:

| Archivo | Qué debe contener |
|---|---|
| `.github/workflows/week-03-ci-amenazas-feedback.yml` | Workflow público del paquete, integrado al repositorio y con las comprobaciones obligatorias activas. |
| `docs/threat-model.md` | Activos, fronteras, amenazas priorizadas, controles y verificación asociada. |
| `reports/week-03/security.json` | Resultados reproducibles de las comprobaciones de seguridad y de los fallos declarados. |
| `evidence/week-03/engineering.json` | Decisión justificada, alternativas, beneficios y costos, requisito y comprobación relacionada. |
| `evidence/week-03/individual.json` | Un registro técnico por integrante; los tres se reúnen en un solo archivo. |

**Decisión que deben justificar:** Justifiquen qué amenaza atienden primero y por qué el control seleccionado reduce su riesgo.

El formato de reportes, campos JSON y evidencia individual se explica en `STARTER_AND_REPOSITORY.md` y `docs/EVIDENCE_CONTRACT.md`. No basta con crear archivos vacíos o escribir que las pruebas pasaron: conserven comandos y observaciones reales.

## ¿Cómo comprueban y entregan?

Sigan el orden completo de `STARTER_AND_REPOSITORY.md`: guarden el código, completen evidencias, ejecuten `make feedback`, `make verify-week-03` y `make public-test-week-03`, y guarden el commit exclusivo de reportes/evidencias. Después creen la etiqueta **`week-03-final`** y ejecuten **`make evidence-week-03`**. Ese último comando necesita que la etiqueta ya exista.

Cuando las comprobaciones pasen, suban la versión y la etiqueta a GitHub. En Classroom entreguen **el enlace del repositorio, `week-03-final` y su SHA completo**. El SHA identifica exactamente la versión que se calificará; los cambios posteriores no forman parte de esa entrega. No basta con adjuntar capturas o guardar el proyecto sólo en su computadora.

La guía de entrega también está en el ZIP como `docs/assignments/week-03-repository.md`.

## ¿Cómo se califica?

- **AC-01 — 2.5 puntos:** instalación y verificación reproducibles desde la versión entregada.
- **AC-02 — 2 puntos:** El workflow ejecuta las comprobaciones obligatorias con mínimo privilegio y conserva resultados; el modelo vincula activos, amenazas, controles y pruebas.
- **AC-03 — 1.5 puntos:** Demuestren que un fallo obligatorio no se oculta y que los controles del modelo se pueden comprobar, en vez de quedar sólo escritos.
- **AC-04 — 1.5 puntos:** decisión técnica justificada y relacionada con una prueba y su resultado.
- **AC-05 — 0.5 puntos:** aportación técnica individual verificable y explicación cuando se solicite.

**Total: 8 puntos.** Lean `RUBRIC_PUBLIC.md` para los niveles completo, parcial y sin crédito y para las condiciones que limitan la calificación. El ZIP la incluye en `docs/assignments/week-03-rubric.md`.

## Cómo se obtiene tu calificación

La actividad **no se califica por cantidad de archivos ni por número de commits**. Se suman cinco criterios independientes y el resultado máximo es **8 puntos**:

1. **AC-01 — 2.5 puntos, automático.** Se fija tu tag/SHA y se reproduce el proyecto. El nivel completo requiere instalación y checks obligatorios reproducibles; una deficiencia no crítica reproducible es parcial; sin reproducción o con el check central fallido no hay crédito.
2. **AC-02 — 2 puntos, automático.** Se ejecutan las pruebas públicas y los casos declarados. El nivel completo requiere demostrar el comportamiento completo y sus límites; el nivel parcial significa que el flujo principal funciona pero falla un caso límite. En este hito se busca: El workflow ejecuta las comprobaciones obligatorias con mínimo privilegio y conserva resultados; el modelo vincula activos, amenazas, controles y pruebas.
3. **AC-03 — 1.5 puntos, automático.** Se reproduce la falla declarada y se revisa su manejo. El nivel completo requiere una corrección segura y evidencia útil; evidencia incompleta es parcial; un cierre inesperado, bucle, corrupción o exposición no obtiene crédito. Para esta semana deben demostrar: Demuestren que un fallo obligatorio no se oculta y que los controles del modelo se pueden comprobar, en vez de quedar sólo escritos.
4. **AC-04 — 1.5 puntos, semiautomático.** Se valida `engineering.json` y se contrasta con el repositorio. El nivel completo conecta requisito, alternativas, decisión, trade-off, prueba y resultado; un documento genérico o contradictorio no obtiene crédito. La decisión central es: Justifiquen qué amenaza atienden primero y por qué el control seleccionado reduce su riesgo.
5. **AC-05 — 0.5 puntos, semiautomático.** Se revisa `individual.json` y la señal técnica de cada integrante. El nivel completo es una aportación verificable y explicable; una señal limitada pero coherente es parcial; la ausencia de evidencia no obtiene crédito. Los flags y la muestra rotativa sólo activan corroboración: no son un descuento automático.

Los tres primeros criterios suman **6 puntos automáticos** y los dos últimos **2 puntos semiautomáticos**. No hay puntos manuales rutinarios. Los quality gates son límites, no descuentos adicionales; si coinciden varios, se aplica una sola vez el límite más restrictivo. La rúbrica no asigna un porcentaje inventado al nivel parcial: el resultado se determina por la evidencia observada en cada criterio.

GitHub Actions ofrece retroalimentación; la calificación final se obtiene al verificar la versión entregada. No usen secretos ni datos reales, no alteren pruebas para forzar éxito y no sustituyan evidencia ejecutable con capturas. Mantengan las políticas de IA y evidencia individual explicadas en la guía de entrega.

## Antes de cerrar esta semana

- Comprueben el funcionamiento requerido y el caso de falla, no sólo el camino exitoso.
- Revisen que código, documentos y reportes describan la misma versión.
- Confirmen la aportación de los tres integrantes y el envío de etiqueta y SHA.
- Cada integrante debe responder el **quiz semanal 3** por separado: **3 preguntas, 2 puntos**, adicionales a los 8 de esta actividad. Ambos forman parte de la evaluación continua.
