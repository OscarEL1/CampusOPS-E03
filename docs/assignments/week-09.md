# Semana 9 — Usar mapas o geocodificación sin bloquear CampusOps

**Actividad:** Integración resiliente con API de terceros. **Valor:** 8 puntos. **Equipo:** 3 integrantes.

Disponible del **27 de octubre de 2026 a las 08:00** al **2 de noviembre de 2026 a las 23:59**, hora de Ciudad de México.

## El resultado que buscamos

El servicio de ubicación puede fallar y una respuesta de cierre puede perderse después de que el servidor ya guardó el cambio. Esta semana harán que CampusOps siga siendo útil y reintente sólo cuando sea seguro.

## Antes de empezar

Conserven la cola, las identidades de operación, la resolución de conflictos, la sesión y la sanitización de las semanas anteriores.

Usen el mismo repositorio y stack: **React Native + Expo + TypeScript**. Instalen el ZIP `week-09-integracion-resiliente.zip` siguiendo `STARTER_AND_REPOSITORY.md`. Lean el alcance en `docs/CAMPUSOPS.md` y el contrato público en `docs/CAMPUSOPS_API.md`. Mantengan las funciones y controles acumulados: avanzar de semana no permite desactivar lo anterior. Si una dificultad previa les impide continuar, repórtenla al docente con evidencia del problema para recibir apoyo.

## ¿Qué deben hacer?

### 1. Integren el servicio de ubicación

Integren mapas o geocodificación mediante un adaptador y caché. Documenten proveedor y restricciones, y conserven evidencia de una ejecución real con datos ficticios. Para reproducir fallos usen el doble controlado, sin depender de cuotas o disponibilidad externa.

### 2. Conserven una alternativa manual

Implementen selectIncidentLocation según docs/CAMPUSOPS_API.md. Verifiquen éxito, datos incompletos o inválidos, timeout, 429 y desconexión. Si el proveedor no sirve, la app debe permitir escribir edificio, zona o referencia; no inventen coordenadas.

### 3. Limiten los reintentos

Implementen planRetry respetando Retry-After, esperas progresivas y límites publicados: no se reintenta desde el intento 4. Las demoras deben ser finitas y los límites configurables y comprobables. Un POST no se repite sin identidad estable de operación.

### 4. Reproduzcan una respuesta perdida

Prueben una resolución o cierre que el servidor procesa aunque la respuesta no llegue. Al reintentar, conserven la misma clave y contenido; no deben duplicarse eventos, evidencias o notificaciones. Registren intentos y tiempos sanitizados y expliquen cuándo reintentar, usar la alternativa o informar un fallo.

## Términos que usarán

- **Geocodificación:** Servicio que relaciona una ubicación escrita con coordenadas.
- **429 / Retry-After:** El servicio limita las solicitudes e indica cuánto esperar antes de volver a intentar.
- **Backoff:** Aumentar la espera entre reintentos para no saturar el servicio.
- **Clave de idempotencia:** Identificador estable de una operación que permite repetirla sin duplicar su efecto.
- **Fallback:** Alternativa que mantiene útil el flujo cuando la opción principal falla.

## ¿Qué archivos deben entregar?

Las rutas son relativas a la raíz del repositorio. Además del código y las pruebas del hito, deben quedar estos archivos:

| Archivo | Qué debe contener |
|---|---|
| `docs/resilience-policy.md` | Proveedor y ejecución externa, caché, ubicación manual y reglas de reintento o fallo. |
| `reports/week-09/fault-injection.json` | Evidencia de fallos reproducidos y respuesta de CampusOps, incluida la respuesta perdida tras guardar. |
| `reports/week-09/retry-metrics.json` | Intentos y tiempos observados que demuestran límites y ausencia de duplicados. |
| `evidence/week-09/engineering.json` | Decisión justificada, alternativas, beneficios y costos, requisito y comprobación relacionada. |
| `evidence/week-09/individual.json` | Un registro técnico por integrante; los tres se reúnen en un solo archivo. |

**Decisión que deben justificar:** Justifiquen cuándo reintentar, cuándo continuar con una alternativa y cuándo informar que la operación falló.

El formato de reportes, campos JSON y evidencia individual se explica en `STARTER_AND_REPOSITORY.md` y `docs/EVIDENCE_CONTRACT.md`. No basta con crear archivos vacíos o escribir que las pruebas pasaron: conserven comandos y observaciones reales.

## ¿Cómo comprueban y entregan?

Sigan el orden completo de `STARTER_AND_REPOSITORY.md`: guarden el código, completen evidencias, ejecuten `make feedback`, `make verify-week-09` y `make public-test-week-09`, y guarden el commit exclusivo de reportes/evidencias. Después creen la etiqueta **`week-09-final`** y ejecuten **`make evidence-week-09`**. Ese último comando necesita que la etiqueta ya exista.

Cuando las comprobaciones pasen, suban la versión y la etiqueta a GitHub. En Classroom entreguen **el enlace del repositorio, `week-09-final` y su SHA completo**. El SHA identifica exactamente la versión que se calificará; los cambios posteriores no forman parte de esa entrega. No basta con adjuntar capturas o guardar el proyecto sólo en su computadora.

La guía de entrega también está en el ZIP como `docs/assignments/week-09-repository.md`.

## ¿Cómo se califica?

- **AC-01 — 2.5 puntos:** instalación y verificación reproducibles desde la versión entregada.
- **AC-02 — 2 puntos:** La integración mantiene caché y ubicación manual, respeta Retry-After y los límites de reintento, y conserva una clave estable para repetir operaciones con efecto.
- **AC-03 — 1.5 puntos:** Demuestren que no hay reintentos infinitos, exceso descontrolado de solicitudes ni efectos duplicados cuando se pierde una respuesta.
- **AC-04 — 1.5 puntos:** decisión técnica justificada y relacionada con una prueba y su resultado.
- **AC-05 — 0.5 puntos:** aportación técnica individual verificable y explicación cuando se solicite.

**Total: 8 puntos.** Lean `RUBRIC_PUBLIC.md` para los niveles completo, parcial y sin crédito y para las condiciones que limitan la calificación. El ZIP la incluye en `docs/assignments/week-09-rubric.md`.

## Cómo se obtiene tu calificación

La actividad **no se califica por cantidad de archivos ni por número de commits**. Se suman cinco criterios independientes y el resultado máximo es **8 puntos**:

1. **AC-01 — 2.5 puntos, automático.** Se fija tu tag/SHA y se reproduce el proyecto. El nivel completo requiere instalación y checks obligatorios reproducibles; una deficiencia no crítica reproducible es parcial; sin reproducción o con el check central fallido no hay crédito.
2. **AC-02 — 2 puntos, automático.** Se ejecutan las pruebas públicas y los casos declarados. El nivel completo requiere demostrar el comportamiento completo y sus límites; el nivel parcial significa que el flujo principal funciona pero falla un caso límite. En este hito se busca: La integración mantiene caché y ubicación manual, respeta Retry-After y los límites de reintento, y conserva una clave estable para repetir operaciones con efecto.
3. **AC-03 — 1.5 puntos, automático.** Se reproduce la falla declarada y se revisa su manejo. El nivel completo requiere una corrección segura y evidencia útil; evidencia incompleta es parcial; un cierre inesperado, bucle, corrupción o exposición no obtiene crédito. Para esta semana deben demostrar: Demuestren que no hay reintentos infinitos, exceso descontrolado de solicitudes ni efectos duplicados cuando se pierde una respuesta.
4. **AC-04 — 1.5 puntos, semiautomático.** Se valida `engineering.json` y se contrasta con el repositorio. El nivel completo conecta requisito, alternativas, decisión, trade-off, prueba y resultado; un documento genérico o contradictorio no obtiene crédito. La decisión central es: Justifiquen cuándo reintentar, cuándo continuar con una alternativa y cuándo informar que la operación falló.
5. **AC-05 — 0.5 puntos, semiautomático.** Se revisa `individual.json` y la señal técnica de cada integrante. El nivel completo es una aportación verificable y explicable; una señal limitada pero coherente es parcial; la ausencia de evidencia no obtiene crédito. Los flags y la muestra rotativa sólo activan corroboración: no son un descuento automático.

Los tres primeros criterios suman **6 puntos automáticos** y los dos últimos **2 puntos semiautomáticos**. No hay puntos manuales rutinarios. Los quality gates son límites, no descuentos adicionales; si coinciden varios, se aplica una sola vez el límite más restrictivo. La rúbrica no asigna un porcentaje inventado al nivel parcial: el resultado se determina por la evidencia observada en cada criterio.

GitHub Actions ofrece retroalimentación; la calificación final se obtiene al verificar la versión entregada. No usen secretos ni datos reales, no alteren pruebas para forzar éxito y no sustituyan evidencia ejecutable con capturas. Mantengan las políticas de IA y evidencia individual explicadas en la guía de entrega.

## Antes de cerrar esta semana

- Comprueben el funcionamiento requerido y el caso de falla, no sólo el camino exitoso.
- Revisen que código, documentos y reportes describan la misma versión.
- Confirmen la aportación de los tres integrantes y el envío de etiqueta y SHA.
- Cada integrante debe responder el **quiz semanal 9** por separado: **3 preguntas, 2 puntos**, adicionales a los 8 de esta actividad. Ambos forman parte de la evaluación continua.
