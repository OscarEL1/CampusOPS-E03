# Semana 2 — Organizar el código de CampusOps y justificar la arquitectura

**Actividad:** Arquitectura móvil justificable. **Valor:** 8 puntos. **Equipo:** 3 integrantes.

Disponible del **8 de septiembre de 2026 a las 08:00** al **14 de septiembre de 2026 a las 23:59**, hora de Ciudad de México.

## El resultado que buscamos

CampusOps tendrá pantallas, reglas de incidencias, sesión, almacenamiento y servicios de ubicación. Esta semana decidirán cómo separar esas responsabilidades para poder probarlas y cambiar una parte sin rehacer todo el proyecto.

## Antes de empezar

Continúen con el alcance, los riesgos y el repositorio de semana 1. Mantengan la instalación reproducible y las pruebas que ya corresponden al proyecto.

Usen el mismo repositorio y stack: **React Native + Expo + TypeScript**. Instalen el ZIP `week-02-arquitectura-justificable.zip` siguiendo `STARTER_AND_REPOSITORY.md`. Lean el alcance en `docs/CAMPUSOPS.md` y el contrato público en `docs/CAMPUSOPS_API.md`. Mantengan las funciones y controles acumulados: avanzar de semana no permite desactivar lo anterior. Si una dificultad previa les impide continuar, repórtenla al docente con evidencia del problema para recibir apoyo.

## ¿Qué deben hacer?

### 1. Comparen dos alternativas

Comparen al menos dos formas de organizar la arquitectura interna. Justifiquen la elegida según facilidad de prueba, complejidad y cambio de proveedor. React Native, Expo y TypeScript ya están definidos: no deben volver a elegir el stack.

### 2. Dibujen las responsabilidades y sus conexiones

Representen los límites de interfaz (UI), aplicación (application), dominio (domain) e infraestructura (infrastructure), con dependencias dirigidas. Incluyan los tres perfiles de usuario y los límites de incidencias, sesión, persistencia y proveedores. La UI no debe depender directamente de infraestructura.

### 3. Construyan un esqueleto ejecutable

Conserven una lista y un detalle de incidencias con datos ficticios. Organicen el código según el diseño y permitan sustituir componentes mediante sus interfaces. No necesitan resolver anticipadamente todos los hitos.

### 4. Contrasten el dibujo con el código

Comprueben los imports y dependencias reales con una prueba básica de arquitectura. Identifiquen una discrepancia o dependencia que viole los límites, expliquen su efecto y corrijan la inconsistencia; el documento y el código deben describir la misma solución.

## Términos que usarán

- **ADR:** Registro breve de una decisión de arquitectura: opciones consideradas, elección y consecuencias.
- **Mermaid:** Formato de texto para describir diagramas; el archivo solicitado termina en .mmd.
- **Acoplamiento:** Cuánto depende una parte del código de los detalles de otra.

## ¿Qué archivos deben entregar?

Las rutas son relativas a la raíz del repositorio. Además del código y las pruebas del hito, deben quedar estos archivos:

| Archivo | Qué debe contener |
|---|---|
| `docs/adr/ADR-001-architecture.md` | Decisión de arquitectura: alternativas, elección, razones y consecuencias. |
| `docs/architecture.mmd` | Diagrama de componentes y dependencias en Mermaid, coherente con el código. |
| `reports/week-02/dependencies.json` | Comprobación de las dependencias reales y de los límites de arquitectura. |
| `evidence/week-02/engineering.json` | Decisión justificada, alternativas, beneficios y costos, requisito y comprobación relacionada. |
| `evidence/week-02/individual.json` | Un registro técnico por integrante; los tres se reúnen en un solo archivo. |

**Decisión que deben justificar:** Justifiquen el equilibrio entre facilidad de prueba, complejidad y costo de cambiar un proveedor.

El formato de reportes, campos JSON y evidencia individual se explica en `STARTER_AND_REPOSITORY.md` y `docs/EVIDENCE_CONTRACT.md`. No basta con crear archivos vacíos o escribir que las pruebas pasaron: conserven comandos y observaciones reales.

## ¿Cómo comprueban y entregan?

Sigan el orden completo de `STARTER_AND_REPOSITORY.md`: guarden el código, completen evidencias, ejecuten `make feedback`, `make verify-week-02` y `make public-test-week-02`, y guarden el commit exclusivo de reportes/evidencias. Después creen la etiqueta **`week-02-final`** y ejecuten **`make evidence-week-02`**. Ese último comando necesita que la etiqueta ya exista.

Cuando las comprobaciones pasen, suban la versión y la etiqueta a GitHub. En Classroom entreguen **el enlace del repositorio, `week-02-final` y su SHA completo**. El SHA identifica exactamente la versión que se calificará; los cambios posteriores no forman parte de esa entrega. No basta con adjuntar capturas o guardar el proyecto sólo en su computadora.

La guía de entrega también está en el ZIP como `docs/assignments/week-02-repository.md`.

## ¿Cómo se califica?

- **AC-01 — 2.5 puntos:** instalación y verificación reproducibles desde la versión entregada.
- **AC-02 — 2 puntos:** El ADR compara al menos dos alternativas; el diagrama y el esqueleto ejecutable respetan los mismos límites y permiten sustituir componentes.
- **AC-03 — 1.5 puntos:** Demuestren que detectan y corrigen una contradicción entre la arquitectura documentada y los imports o dependencias reales.
- **AC-04 — 1.5 puntos:** decisión técnica justificada y relacionada con una prueba y su resultado.
- **AC-05 — 0.5 puntos:** aportación técnica individual verificable y explicación cuando se solicite.

**Total: 8 puntos.** Lean `RUBRIC_PUBLIC.md` para los niveles completo, parcial y sin crédito y para las condiciones que limitan la calificación. El ZIP la incluye en `docs/assignments/week-02-rubric.md`.

## Cómo se obtiene tu calificación

La actividad **no se califica por cantidad de archivos ni por número de commits**. Se suman cinco criterios independientes y el resultado máximo es **8 puntos**:

1. **AC-01 — 2.5 puntos, automático.** Se fija tu tag/SHA y se reproduce el proyecto en el entorno de evaluación. Obtienes el nivel completo si la instalación y todos los checks obligatorios pasan; el nivel parcial corresponde a una deficiencia no crítica que sigue siendo reproducible; sin reproducción o con el check central fallido no hay crédito para este criterio.
2. **AC-02 — 2 puntos, automático.** Se ejecutan las pruebas públicas de arquitectura y los casos declarados. Se busca que ADR, diagrama, imports y esqueleto describan la misma separación UI–application–domain–infrastructure. El nivel parcial significa que el flujo principal funciona pero un límite o caso público falla; no basta con que el diagrama se vea bien.
3. **AC-03 — 1.5 puntos, automático.** Se comprueba la falla declarada: una contradicción entre el diseño documentado y las dependencias reales. El nivel completo requiere detectar la causa, corregirla y dejar evidencia de un estado seguro; evidencia incompleta es parcial; un cierre inesperado, bucle, corrupción o exposición no obtiene crédito.
4. **AC-04 — 1.5 puntos, semiautomático.** Se valida la estructura de `engineering.json` y se contrasta con el repositorio. El nivel completo conecta requisito, al menos dos alternativas, decisión, trade-off, prueba y resultado; un documento genérico o contradictorio no obtiene crédito.
5. **AC-05 — 0.5 puntos, semiautomático.** Se revisa `individual.json` y la señal técnica de cada integrante. El nivel completo es una aportación verificable y explicable; una señal limitada pero coherente es parcial; la ausencia de evidencia no obtiene crédito. Los flags y la muestra rotativa sólo activan corroboración: no son un descuento automático.

    Los tres primeros criterios suman **6 puntos automáticos** y los dos últimos **2 puntos semiautomáticos**. No hay puntos manuales rutinarios. Los quality gates son límites de la actividad, no descuentos adicionales; si coinciden varios, se aplica una sola vez el límite más restrictivo. La rúbrica no asigna un porcentaje inventado al nivel parcial: el resultado se determina por la evidencia observada en cada criterio.

GitHub Actions ofrece retroalimentación; la calificación final se obtiene al verificar la versión entregada. No usen secretos ni datos reales, no alteren pruebas para forzar éxito y no sustituyan evidencia ejecutable con capturas. Mantengan las políticas de IA y evidencia individual explicadas en la guía de entrega.

## Antes de cerrar esta semana

- Comprueben el funcionamiento requerido y el caso de falla, no sólo el camino exitoso.
- Revisen que código, documentos y reportes describan la misma versión.
- Confirmen la aportación de los tres integrantes y el envío de etiqueta y SHA.
- Cada integrante debe responder el **quiz semanal 2** por separado: **3 preguntas, 3 puntos**, adicionales a los 8 de esta actividad. Ambos forman parte de la evaluación continua.
