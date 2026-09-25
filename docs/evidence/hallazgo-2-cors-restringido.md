# Evidencia — Hallazgo 2

## Corrección aplicada

- Se eliminó `Access-Control-Allow-Origin: *` del backend.
- Se agregó `COURSE_BACKEND_ALLOWED_ORIGINS` como lista explícita de orígenes autorizados.
- El encabezado CORS sólo se devuelve cuando el origen recibido está autorizado.
- Los preflight de orígenes no autorizados reciben estado 403.
- Las solicitudes de clientes nativos o locales que no envían `Origin` continúan funcionando.

## Casos comprobados

La prueba integral inició el backend con `http://localhost:8081` como único origen permitido y verificó:

1. Una solicitud desde el origen permitido recibió `Access-Control-Allow-Origin: http://localhost:8081`.
2. Una solicitud desde `https://untrusted.example` no recibió un encabezado de autorización CORS.
3. El preflight del origen no autorizado recibió estado 403.
4. El preflight del origen permitido recibió estado 204 y el encabezado correcto.
5. Los contratos existentes del backend continuaron funcionando.

## Resultado

```text
CORS allowlist: allowed origin PASS; untrusted origin blocked PASS.
CampusOps backend contracts: roles, reassignment conflict, lost response, idempotency, evidence and geocoding PASS.
Controlled backend self-test passed.
```

La salida reproducible se conserva en `hallazgo-2-prueba-backend.txt`. El comando utilizado fue `npm run backend:self-test`.
