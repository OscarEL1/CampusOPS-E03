# Semana 4 — Proteger la sesión y evitar filtraciones de datos

**Actividad:** Controles de seguridad y privacidad. **Valor:** 8 puntos. **Equipo:** 3 integrantes.

Disponible del **22 de septiembre de 2026 a las 08:00** al **28 de septiembre de 2026 a las 23:59**, hora de Ciudad de México.

## El resultado que buscamos

Una app puede ocultar información en pantalla y aun así dejarla expuesta en archivos o registros de errores. Esta semana protegerán el almacenamiento y comprobarán que CampusOps no filtra información sensible.

## Antes de empezar

Usen el modelo de amenazas de semana 3 para justificar los controles. Mantengan la arquitectura y las comprobaciones automáticas existentes.

Usen el mismo repositorio y stack: **React Native + Expo + TypeScript**. Instalen el ZIP `week-04-seguridad-privacidad.zip` siguiendo `STARTER_AND_REPOSITORY.md`. Lean el alcance en `docs/CAMPUSOPS.md` y el contrato público en `docs/CAMPUSOPS_API.md`. Mantengan las funciones y controles acumulados: avanzar de semana no permite desactivar lo anterior. Si una dificultad previa les impide continuar, repórtenla al docente con evidencia del problema para recibir apoyo.

## ¿Qué deben hacer?

### 1. Revisen dónde termina la información

Identifiquen almacenamiento, registros técnicos y reportes que puedan conservar sesión, nombres, ubicación, fotografías o comentarios internos. No utilicen información real para demostrar una filtración.

### 2. Implementen almacenamiento y errores seguros

Usen un mecanismo de almacenamiento seguro para los datos que lo requieran, eliminen secretos escritos en el código y eviten exponerlos al informar errores. Justifiquen el mecanismo elegido y los riesgos que todavía deben controlarse.

### 3. Saniticen los registros

Conecten redactForTelemetry con la lógica real de CampusOps. Apliquen el contrato de docs/CAMPUSOPS_API.md a objetos anidados y listas, sin modificar la entrada original. Oculten los campos sensibles y conserven sólo contexto técnico seguro.

### 4. Prueben también los caminos de error

Comprueben que los datos protegidos no aparecen en logs, preferencias o reportes, aunque ya no se vean en la interfaz. Relacionen las pruebas negativas con las amenazas y conserven los resultados del escaneo y del comportamiento observado.

## Términos que usarán

- **Log:** Registro técnico de lo que ocurrió; no debe convertirse en una copia de los datos sensibles.
- **Sanitización:** Eliminar u ocultar datos sensibles antes de registrarlos o mostrarlos en un error.
- **Prueba negativa:** Comprobación de lo que el sistema debe rechazar o manejar de forma segura.
- **Riesgo residual:** Riesgo que permanece después de aplicar un control.

## ¿Qué archivos deben entregar?

Las rutas son relativas a la raíz del repositorio. Además del código y las pruebas del hito, deben quedar estos archivos:

| Archivo | Qué debe contener |
|---|---|
| `docs/security-controls.md` | Controles implementados, relación con las amenazas, elección de almacenamiento y riesgo residual. |
| `reports/week-04/secret-scan.json` | Resultado reproducible de la búsqueda de secretos en los archivos de la entrega. |
| `reports/week-04/negative-tests.json` | Pruebas de exposición y sanitización, incluidas estructuras anidadas y caminos de error. |
| `evidence/week-04/engineering.json` | Decisión justificada, alternativas, beneficios y costos, requisito y comprobación relacionada. |
| `evidence/week-04/individual.json` | Un registro técnico por integrante; los tres se reúnen en un solo archivo. |

**Decisión que deben justificar:** Justifiquen el mecanismo de almacenamiento seleccionado y el riesgo residual que permanece.

El formato de reportes, campos JSON y evidencia individual se explica en `STARTER_AND_REPOSITORY.md` y `docs/EVIDENCE_CONTRACT.md`. No basta con crear archivos vacíos o escribir que las pruebas pasaron: conserven comandos y observaciones reales.

## ¿Cómo comprueban y entregan?

Sigan el orden completo de `STARTER_AND_REPOSITORY.md`: guarden el código, completen evidencias, ejecuten `make feedback`, `make verify-week-04` y `make public-test-week-04`, y guarden el commit exclusivo de reportes/evidencias. Después creen la etiqueta **`week-04-final`** y ejecuten **`make evidence-week-04`**. Ese último comando necesita que la etiqueta ya exista.

Cuando las comprobaciones pasen, suban la versión y la etiqueta a GitHub. En Classroom entreguen **el enlace del repositorio, `week-04-final` y su SHA completo**. El SHA identifica exactamente la versión que se calificará; los cambios posteriores no forman parte de esa entrega. No basta con adjuntar capturas o guardar el proyecto sólo en su computadora.

La guía de entrega también está en el ZIP como `docs/assignments/week-04-repository.md`.

## ¿Cómo se califica?

- **AC-01 — 2.5 puntos:** instalación y verificación reproducibles desde la versión entregada.
- **AC-02 — 2 puntos:** El almacenamiento, los logs y los errores aplican los controles de seguridad declarados, con datos ficticios y pruebas relacionadas con las amenazas.
- **AC-03 — 1.5 puntos:** Demuestren que la información sensible no permanece en logs, preferencias o reportes después de ocultarla en la interfaz.
- **AC-04 — 1.5 puntos:** decisión técnica justificada y relacionada con una prueba y su resultado.
- **AC-05 — 0.5 puntos:** aportación técnica individual verificable y explicación cuando se solicite.

**Total: 8 puntos.** Lean `RUBRIC_PUBLIC.md` para los niveles completo, parcial y sin crédito y para las condiciones que limitan la calificación. El ZIP la incluye en `docs/assignments/week-04-rubric.md`.

## Cómo se obtiene tu calificación

La actividad **no se califica por cantidad de archivos ni por número de commits**. Se suman cinco criterios independientes y el resultado máximo es **8 puntos**:

1. **AC-01 — 2.5 puntos, automático.** Se fija tu tag/SHA y se reproduce el proyecto. El nivel completo requiere instalación y checks obligatorios reproducibles; una deficiencia no crítica reproducible es parcial; sin reproducción o con el check central fallido no hay crédito.
2. **AC-02 — 2 puntos, automático.** Se ejecutan las pruebas públicas y los casos declarados. El nivel completo requiere demostrar el comportamiento completo y sus límites; el nivel parcial significa que el flujo principal funciona pero falla un caso límite. En este hito se busca: El almacenamiento, los logs y los errores aplican los controles de seguridad declarados, con datos ficticios y pruebas relacionadas con las amenazas.
3. **AC-03 — 1.5 puntos, automático.** Se reproduce la falla declarada y se revisa su manejo. El nivel completo requiere una corrección segura y evidencia útil; evidencia incompleta es parcial; un cierre inesperado, bucle, corrupción o exposición no obtiene crédito. Para esta semana deben demostrar: Demuestren que la información sensible no permanece en logs, preferencias o reportes después de ocultarla en la interfaz.
4. **AC-04 — 1.5 puntos, semiautomático.** Se valida `engineering.json` y se contrasta con el repositorio. El nivel completo conecta requisito, alternativas, decisión, trade-off, prueba y resultado; un documento genérico o contradictorio no obtiene crédito. La decisión central es: Justifiquen el mecanismo de almacenamiento seleccionado y el riesgo residual que permanece.
5. **AC-05 — 0.5 puntos, semiautomático.** Se revisa `individual.json` y la señal técnica de cada integrante. El nivel completo es una aportación verificable y explicable; una señal limitada pero coherente es parcial; la ausencia de evidencia no obtiene crédito. Los flags y la muestra rotativa sólo activan corroboración: no son un descuento automático.

Los tres primeros criterios suman **6 puntos automáticos** y los dos últimos **2 puntos semiautomáticos**. No hay puntos manuales rutinarios. Los quality gates son límites, no descuentos adicionales; si coinciden varios, se aplica una sola vez el límite más restrictivo. La rúbrica no asigna un porcentaje inventado al nivel parcial: el resultado se determina por la evidencia observada en cada criterio.

GitHub Actions ofrece retroalimentación; la calificación final se obtiene al verificar la versión entregada. No usen secretos ni datos reales, no alteren pruebas para forzar éxito y no sustituyan evidencia ejecutable con capturas. Mantengan las políticas de IA y evidencia individual explicadas en la guía de entrega.

## Antes de cerrar esta semana

- Comprueben el funcionamiento requerido y el caso de falla, no sólo el camino exitoso.
- Revisen que código, documentos y reportes describan la misma versión.
- Confirmen la aportación de los tres integrantes y el envío de etiqueta y SHA.
- Cada integrante debe responder el **quiz semanal 4** por separado: **3 preguntas, 2 puntos**, adicionales a los 8 de esta actividad. Ambos forman parte de la evaluación continua.
