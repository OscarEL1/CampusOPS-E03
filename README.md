# CampusOps — starter público de Desarrollo Móvil Integral

Base técnica: Expo SDK 57, React Native 0.86, React 19, TypeScript estricto y Node.js 22. Este repositorio es el punto de partida del equipo; no contiene pruebas ocultas, respuestas, secretos ni lógica privada de calificación.

Lee `docs/CAMPUSOPS.md` (caso y alcance) y `docs/CAMPUSOPS_API.md` (contratos y variantes públicas). La pantalla inicial sólo comprueba la línea base; no implementa los flujos que el equipo debe construir. Los adaptadores en `src/course-evaluation/` permanecen intencionalmente pendientes para sus semanas: la suite completa no tiene que pasar al recibir el starter; sí debe pasar `make feedback`.

El nombre es provisional. Se conservan slug e identificadores nativos existentes para no romper builds o instalación. Los fixtures del backend son públicos, ficticios y sólo para desarrollo; no equivalen a una autenticación de producción.

## Requisitos

- Node.js 22.22.0 (la versión esperada está en `.nvmrc`).
- npm, GNU Make y Git.
- Para Android nativo: JDK 17 y Android SDK con Platform 35, Build Tools 35 y NDK 27.1.12297006.
- Equipo de exactamente tres integrantes y repositorio público de GitHub, conforme a las instrucciones docentes.

## Inicio reproducible

```bash
nvm use
make setup
make feedback
```

Para desarrollo local:

```bash
make run-backend
make run
```

`make feedback` ejecuta la misma base pública del workflow: typecheck, lint, smoke test, auditoría crítica y bundle Android de Expo. Un resultado verde ofrece retroalimentación, pero la calificación final la determina una reproducción docente desde el SHA entregado y checks adicionales controlados por la materia.

## Actividades semanales

Cada paquete semanal agrega el enunciado dirigido al alumno, su test público y un workflow de feedback. Copia únicamente los archivos indicados por el paquete y ejecuta:

```bash
make verify-week-01
make public-test-week-01
make evidence-week-01
```

Sustituye `01` por la semana efectiva correspondiente. No edites tests o workflows para ocultar fallos. Consulta `docs/EVIDENCE_CONTRACT.md` y `docs/SUBMISSION.md` antes de entregar.

## Identidad, entrega y seguridad

- Configura en Git el nombre y correo aprobados en el roster; no compartas una sola identidad entre integrantes.
- La entrega semanal es el tag `week-XX-final`, su SHA completo y la URL del repositorio.
- No subas `.env`, tokens, credenciales, datos personales reales ni archivos de firma.
- El backend incluido es sintético y no contiene credenciales.
- Todo valor `EXPO_PUBLIC_*` queda expuesto al cliente y jamás debe contener secretos.
