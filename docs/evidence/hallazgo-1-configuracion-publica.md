# Evidencia — Hallazgo 1

## Corrección aplicada

- Se eliminó `EXPO_PUBLIC_API_SECRET` de `.env.example`.
- Se retiró el módulo cliente `src/config/backendConfig.ts`, que intentaba leer esa variable pública como si fuera un secreto.
- La prueba T-04 ahora revisa también `.env.example` y comprueba que el entorno público no declare nombres de secretos.

## Comprobación estática

Se buscaron variables públicas cuyos nombres indicaran secretos, claves privadas o tokens de acceso en `.env.example`, `src` y `App.tsx`.

Resultado:

```text
Sin coincidencias en el código cliente ni en .env.example
```

También se buscaron consumidores del módulo retirado.

Resultado:

```text
Sin referencias activas al módulo retirado
```

## Prueba automática

Comando previsto:

```bash
npm run test:security
```

Resultado final:

```text
TypeScript: código de salida 0.
Pruebas de seguridad: código de salida 0.
Suites: 1 aprobada de 1.
Pruebas: 12 aprobadas de 12.

T-04 exposing credentials in the repository
  PASS the public client environment declares no secret-like variable
  PASS no tracked file matches a known credential pattern
```

La salida reproducible se conserva en `hallazgo-1-prueba-seguridad.txt`. Los comandos utilizados fueron `npm run typecheck` y `npm run test:security`.
