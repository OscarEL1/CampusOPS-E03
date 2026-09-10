# Semana 2 — ¿Cómo se califica la actividad?

La actividad vale **8 puntos**. El quiz individual vale **3 puntos**, por separado.

## Qué se revisa

| Criterio | Qué deben demostrar | Máximo |
|---|---|---:|
| AC-01 — Reproducción | La versión identificada por el SHA se instala y pasa `make verify-week-02`; se conserva el reporte. | 2.5 |
| AC-02 — Comportamiento | El ADR compara al menos dos alternativas; el diagrama y el esqueleto ejecutable respetan los mismos límites y permiten sustituir componentes. Se comprueba con pruebas públicas y reportes. | 2.0 |
| AC-03 — Falla | Demuestren que detectan y corrigen una contradicción entre la arquitectura documentada y los imports o dependencias reales. Conserven comandos y resultados observables. | 1.5 |
| AC-04 — Decisión | Justifiquen el equilibrio entre facilidad de prueba, complejidad y costo de cambiar un proveedor. Relaciónenlo con pruebas en `evidence/week-02/engineering.json`. | 1.5 |
| AC-05 — Aportación individual | Cada integrante tiene una aportación verificable en `evidence/week-02/individual.json` y puede explicarla cuando se solicite. | 0.5 |

AC-01 a AC-03 se comprueban automáticamente. AC-04 y AC-05 combinan comprobación estructurada y corroboración cuando corresponda. GitHub Actions ofrece retroalimentación; la calificación final se obtiene al verificar la versión entregada.

## Cómo se obtiene tu calificación

La actividad **no se califica por cantidad de archivos ni por número de commits**. Se suman cinco criterios independientes y el resultado máximo es **8 puntos**:

1. **AC-01 — 2.5 puntos, automático.** Se fija tu tag/SHA y se reproduce el proyecto en el entorno de evaluación. Obtienes el nivel completo si la instalación y todos los checks obligatorios pasan; el nivel parcial corresponde a una deficiencia no crítica que sigue siendo reproducible; sin reproducción o con el check central fallido no hay crédito para este criterio.
2. **AC-02 — 2 puntos, automático.** Se ejecutan las pruebas públicas de arquitectura y los casos declarados. Se busca que ADR, diagrama, imports y esqueleto describan la misma separación UI–application–domain–infrastructure. El nivel parcial significa que el flujo principal funciona pero un límite o caso público falla; no basta con que el diagrama se vea bien.
3. **AC-03 — 1.5 puntos, automático.** Se comprueba la falla declarada: una contradicción entre el diseño documentado y las dependencias reales. El nivel completo requiere detectar la causa, corregirla y dejar evidencia de un estado seguro; evidencia incompleta es parcial; un cierre inesperado, bucle, corrupción o exposición no obtiene crédito.
4. **AC-04 — 1.5 puntos, semiautomático.** Se valida la estructura de `engineering.json` y se contrasta con el repositorio. El nivel completo conecta requisito, al menos dos alternativas, decisión, trade-off, prueba y resultado; un documento genérico o contradictorio no obtiene crédito.
5. **AC-05 — 0.5 puntos, semiautomático.** Se revisa `individual.json` y la señal técnica de cada integrante. El nivel completo es una aportación verificable y explicable; una señal limitada pero coherente es parcial; la ausencia de evidencia no obtiene crédito. Los flags y la muestra rotativa sólo activan corroboración: no son un descuento automático.

    Los tres primeros criterios suman **6 puntos automáticos** y los dos últimos **2 puntos semiautomáticos**. No hay puntos manuales rutinarios. Los quality gates son límites de la actividad, no descuentos adicionales; si coinciden varios, se aplica una sola vez el límite más restrictivo. La rúbrica no asigna un porcentaje inventado al nivel parcial: el resultado se determina por la evidencia observada en cada criterio.

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
