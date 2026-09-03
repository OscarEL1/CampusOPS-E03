# Semana 1 — ¿Cómo se califica la actividad?

La actividad vale **8 puntos**. El quiz individual se califica por separado, sobre **2 puntos**.

## Qué se revisa

| Criterio | Qué deben demostrar | Evidencia | Máximo |
|---|---|---|---:|
| AC-01 — Reproducción | Se puede instalar y verificar la versión entregada, no sólo ejecutarla en la computadora del autor. | `make verify-week-01` y reporte. | 2.5 |
| AC-02 — Caso y comprobaciones | Definieron alcance, actores, tres riesgos priorizados y un flujo crítico de CampusOps; el proyecto pasa la prueba básica y los casos públicos de la semana. | Documentos, pruebas públicas y reportes estructurados. | 2.0 |
| AC-03 — Falla | Reprodujeron, diagnosticaron y corrigieron la falla declarada, conservando evidencia y sin eliminar ni ignorar la prueba. | Registro de la falla y su manejo. | 1.5 |
| AC-04 — Decisión | Justifican el alcance, el riesgo prioritario y el criterio de aceptación, conectando la decisión con una comprobación. | `evidence/week-01/engineering.json`. | 1.5 |
| AC-05 — Aportación individual | Cada integrante tiene una aportación técnica verificable y coherente con el repositorio. | `evidence/week-01/individual.json` y explicación cuando se solicite. | 0.5 |

AC-01, AC-02 y AC-03 se comprueban automáticamente. AC-04 y AC-05 combinan comprobación estructurada y corroboración cuando corresponda. Los resultados de GitHub Actions orientan al equipo, pero no son la única autoridad de calificación.

## Niveles de desempeño

Cada criterio se evalúa con estos niveles. La columna de la derecha indica el puntaje máximo, no un puntaje fijo para el nivel parcial.

| Criterio | Crédito completo | Crédito parcial | Sin crédito | Máximo |
|---|---|---|---|---:|
| AC-01 | La versión identificada por el SHA se reproduce y pasan todas las comprobaciones obligatorias. | Se reproduce, con una deficiencia no crítica declarada. | No se reproduce o falla la comprobación central. | 2.5 |
| AC-02 | Cumple el comportamiento y los casos públicos declarados. | Cumple el flujo principal, pero falla un caso límite. | Falta el flujo principal o se simula con resultados fijos en vez del comportamiento requerido. | 2.0 |
| AC-03 | La falla introducida produce un estado seguro y evidencia útil. | Se maneja la falla, pero la evidencia está incompleta. | Se produce un cierre inesperado, bucle, corrupción de datos o exposición de información. | 1.5 |
| AC-04 | El reporte conecta requisito, decisión, prueba y resultado. | La conexión es parcial, pero verificable. | El documento es genérico o contradice el código. | 1.5 |
| AC-05 | La aportación individual es verificable y se explica con precisión cuando se solicita. | La evidencia técnica es limitada, pero coherente. | No hay evidencia individual o no se puede explicar el cambio. | 0.5 |

El flujo y comportamiento exigidos corresponden a la **semana 1**: definición del caso y proyecto inicial verificable. No se pide implementar ahora toda la app.

## Condiciones que limitan la calificación

- **G1 — Sin SHA o sin reproducción:** la parte automática vale 0 y el máximo de la actividad es **4.8/8**.
- **G2 — Sin el flujo central requerido:** máximo **4.8/8**.
- **G3 — Secreto o dato sensible real expuesto:** el componente de seguridad vale 0, máximo **4.8/8** y se debe revocar la credencial expuesta.
- **G4 — Sin evidencia individual:** AC-05 vale 0 y el máximo individual es **5.6/8**.

Si coincide más de un límite, se aplica una sola vez el más restrictivo. Una señal que necesite aclaración no genera por sí misma un descuento automático.
