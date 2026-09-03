# Controlled backend contract

Run with `make run-backend`. All credentials and data are synthetic.

- `GET /health`
- `GET /v1/resources` with `Authorization: Bearer course-valid-token`
- `POST /v1/session/refresh`
- `POST /v1/resources/action` with a stable `Idempotency-Key`

`X-Course-Scenario` accepts the declared variants `success`, `nullable`, `malformed`, `server_error`, `rate_limited`, `slow`, `invalid_refresh` and `timeout_after_commit`. Private evaluation may combine or reorder only these published behaviors.
# CampusOps: contexto adicional

El simulador conserva los endpoints originales y añade incidencias con tres perfiles, control de versión, operaciones idempotentes y un doble de geocodificación. Consultar `docs/CAMPUSOPS_API.md` desde la raíz del repositorio. `npm run backend:self-test` prueba también reasignación concurrente, respuesta perdida después de guardar, replay sin duplicados y variantes de ubicación. Es un servicio público de pruebas con identidades sintéticas, estado en memoria y sin autenticación de producción; no desplegarlo a Internet.
