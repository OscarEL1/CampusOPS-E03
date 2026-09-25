# Semana 4 — ¿Cómo se califica la actividad?

La actividad vale **8 puntos**. El quiz individual vale **2 puntos**, por separado.

## Qué se revisa

| Criterio | Qué deben demostrar | Máximo |
|---|---|---:|
| AC-01 — Reproducción | La versión identificada por el SHA se instala y pasa `make verify-week-04`; se conserva el reporte. | 2.5 |
| AC-02 — Comportamiento | El almacenamiento, los logs y los errores aplican los controles de seguridad declarados, con datos ficticios y pruebas relacionadas con las amenazas. Se comprueba con pruebas públicas y reportes. | 2.0 |
| AC-03 — Falla | Demuestren que la información sensible no permanece en logs, preferencias o reportes después de ocultarla en la interfaz. Conserven comandos y resultados observables. | 1.5 |
| AC-04 — Decisión | Justifiquen el mecanismo de almacenamiento seleccionado y el riesgo residual que permanece. Relaciónenlo con pruebas en `evidence/week-04/engineering.json`. | 1.5 |
| AC-05 — Aportación individual | Cada integrante tiene una aportación verificable en `evidence/week-04/individual.json` y puede explicarla cuando se solicite. | 0.5 |

AC-01 a AC-03 se comprueban automáticamente. AC-04 y AC-05 combinan comprobación estructurada y corroboración cuando corresponda. GitHub Actions ofrece retroalimentación; la calificación final se obtiene al verificar la versión entregada.

## Cómo se obtiene tu calificación

La actividad **no se califica por cantidad de archivos ni por número de commits**. Se suman cinco criterios independientes y el resultado máximo es **8 puntos**:

1. **AC-01 — 2.5 puntos, automático.** Se fija tu tag/SHA y se reproduce el proyecto. El nivel completo requiere instalación y checks obligatorios reproducibles; una deficiencia no crítica reproducible es parcial; sin reproducción o con el check central fallido no hay crédito.
2. **AC-02 — 2 puntos, automático.** Se ejecutan las pruebas públicas y los casos declarados. El nivel completo requiere demostrar el comportamiento completo y sus límites; el nivel parcial significa que el flujo principal funciona pero falla un caso límite. En este hito se busca: El almacenamiento, los logs y los errores aplican los controles de seguridad declarados, con datos ficticios y pruebas relacionadas con las amenazas.
3. **AC-03 — 1.5 puntos, automático.** Se reproduce la falla declarada y se revisa su manejo. El nivel completo requiere una corrección segura y evidencia útil; evidencia incompleta es parcial; un cierre inesperado, bucle, corrupción o exposición no obtiene crédito. Para esta semana deben demostrar: Demuestren que la información sensible no permanece en logs, preferencias o reportes después de ocultarla en la interfaz.
4. **AC-04 — 1.5 puntos, semiautomático.** Se valida `engineering.json` y se contrasta con el repositorio. El nivel completo conecta requisito, alternativas, decisión, trade-off, prueba y resultado; un documento genérico o contradictorio no obtiene crédito. La decisión central es: Justifiquen el mecanismo de almacenamiento seleccionado y el riesgo residual que permanece.
5. **AC-05 — 0.5 puntos, semiautomático.** Se revisa `individual.json` y la señal técnica de cada integrante. El nivel completo es una aportación verificable y explicable; una señal limitada pero coherente es parcial; la ausencia de evidencia no obtiene crédito. Los flags y la muestra rotativa sólo activan corroboración: no son un descuento automático.

Los tres primeros criterios suman **6 puntos automáticos** y los dos últimos **2 puntos semiautomáticos**. No hay puntos manuales rutinarios. Los quality gates son límites, no descuentos adicionales; si coinciden varios, se aplica una sola vez el límite más restrictivo. La rúbrica no asigna un porcentaje inventado al nivel parcial: el resultado se determina por la evidencia observada en cada criterio.

## Niveles de desempeño

Cada criterio se evalúa con estos niveles. La columna de la derecha indica el puntaje máximo, no un puntaje fijo para el nivel parcial.

| Criterio | Crédito completo | Crédito parcial | Sin crédito | Máximo |
|---|---|---|---|---:|
| AC-01 | La versión identificada por el SHA se reproduce y pasan todas las comprobaciones obligatorias. | Se reproduce, con una deficiencia no crítica declarada. | No se reproduce o falla la comprobación central. | 2.5 |
| AC-02 | Cumple el comportamiento y los casos públicos declarados. | Cumple el flujo principal, pero falla un caso límite. | Falta el flujo principal o se simula con resultados fijos en vez del comportamiento requerido. | 2.0 |
| AC-03 | La falla introducida produce un estado seguro y evidencia útil. | Se maneja la falla, pero la evidencia está incompleta. | Se produce un cierre inesperado, bucle, corrupción de datos o exposición de información. | 1.5 |
| AC-04 | El reporte conecta requisito, decisión, prueba y resultado. | La conexión es parcial, pero verificable. | El documento es genérico o contradice el código. | 1.5 |
| AC-05 | La aportación individual es verificable y se explica con precisión cuando se solicita. | La evidencia técnica es limitada, pero coherente. | No hay evidencia individual o no se puede explicar el cambio. | 0.5 |

## Condiciones que limitan la calificación

- **G1 — Sin SHA o sin reproducción:** la parte automática vale 0 y el máximo de la actividad es **4.8/8**.
- **G2 — Sin el flujo central requerido esta semana:** máximo **4.8/8**.
- **G3 — Secreto o dato sensible real expuesto:** el componente de seguridad vale 0, máximo **4.8/8** y revocación de la credencial expuesta.
- **G4 — Sin evidencia individual:** AC-05 vale 0 y el máximo individual es **5.6/8**.

Si coincide más de un límite, se aplica una sola vez el más restrictivo. Una señal que necesite aclaración no genera por sí misma un descuento automático.
