# Modelo de datos local

CampusOps conserva en el dispositivo las incidencias consultadas y la cola de trabajo sin conexión. El almacenamiento es un archivo SQLite administrado por la aplicación. Las credenciales no forman parte de este modelo: los tokens de sesión permanecen en Expo SecureStore y nunca se escriben en SQLite.

La versión vigente es `PRAGMA user_version = 2`. La definición ejecutable se encuentra en [`localSchema.ts`](../src/campusops/infrastructure/local/localSchema.ts).

## Entidad `incidents`

Cada fila es la última copia del servidor que el dispositivo pudo guardar. Una copia con una versión menor nunca sustituye a otra más reciente.

| Columna | Tipo | Restricciones y significado |
| --- | --- | --- |
| `id` | `TEXT` | Clave primaria, `NOT NULL`; identidad de la incidencia. |
| `version` | `INTEGER` | `NOT NULL`, valor mayor o igual que cero; versión conocida del servidor. |
| `status` | `TEXT` | `NOT NULL`; sólo `open`, `assigned`, `in_progress`, `resolved` o `closed`. |
| `title` | `TEXT` | `NOT NULL`. |
| `category` | `TEXT` | `NOT NULL`. |
| `description` | `TEXT` | `NOT NULL`. |
| `location` | `TEXT` | `NOT NULL`. |
| `reporter_id` | `TEXT` | `NOT NULL`; identidad ficticia del reportante. |
| `assigned_technician_id` | `TEXT` | Admite `NULL` mientras no exista asignación. |
| `cached_at` | `INTEGER` | `NOT NULL`; instante en que se guardó la copia local. |

## Entidad `pending_operations`

Cada fila representa una intención local que todavía no ha sido confirmada por el servidor.

| Columna | Tipo | Restricciones y significado |
| --- | --- | --- |
| `seq` | `INTEGER` | Clave primaria autoincremental; conserva el orden de envío. |
| `operation_id` | `TEXT` | `NOT NULL`, `UNIQUE`, longitud mínima de 8; identidad estable y clave de idempotencia. |
| `incident_id` | `TEXT` | `NOT NULL`; referencia `incidents(id)`. |
| `actor_id` | `TEXT` | `NOT NULL`; autor de la operación. |
| `action` | `TEXT` | `NOT NULL`; sólo `start`, `resolve`, `comment` o `add_evidence`. |
| `content_json` | `TEXT` | `NOT NULL`; contenido tipado serializado de la acción. |
| `base_version` | `INTEGER` | `NOT NULL`, valor mayor o igual que cero; versión sobre la que se creó la intención. |
| `base_fields_json` | `TEXT` | `NOT NULL`; campos base usados para combinar o detectar conflictos. |
| `created_at` | `INTEGER` | `NOT NULL`; instante de creación. |
| `attempts` | `INTEGER` | `NOT NULL`, valor inicial `0`; número de intentos de envío. |
| `state` | `TEXT` | `NOT NULL`, valor inicial `pending`; sólo `pending`, `conflict` o `rejected`. |
| `problem_json` | `TEXT` | Admite `NULL`; detalle del conflicto o rechazo que espera una decisión. |

Existe el índice `pending_operations_by_incident (incident_id, seq)` para recorrer en orden las operaciones de una incidencia. La relación es de una incidencia a cero o más operaciones pendientes. SQLite valida la referencia `pending_operations.incident_id → incidents.id` porque la apertura activa `PRAGMA foreign_keys = ON`.

## Esquema anterior y migración

El esquema 1 usaba una sola tabla `kv_store`:

```sql
CREATE TABLE kv_store (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
```

La clave `incidents` contenía un arreglo JSON de copias locales y `outbox` otro arreglo JSON de cambios pendientes. Las acciones antiguas `note` y `photo` se transforman en `comment` y `add_evidence`. Se conservan la identidad de operación, autor, incidencia, versión base, contenido y orden. Cuando una versión base no corresponde a la copia almacenada, la migración deja los campos base vacíos para forzar una revisión posterior en vez de inventar información.

La migración de la versión 1 a la 2 ocurre dentro de una sola transacción:

1. Crea `incidents`, `pending_operations` y su índice.
2. Valida y copia las incidencias.
3. Valida y copia la cola, traduciendo los nombres antiguos.
4. Elimina `kv_store`.
5. Establece `PRAGMA user_version = 2`.

Si cualquier paso falla o la aplicación se cierra antes del `COMMIT`, SQLite ejecuta el rollback. El esquema 1 y sus documentos JSON permanecen intactos; el siguiente inicio vuelve a intentar toda la migración. Un esquema posterior al 2 se rechaza sin modificarlo.

Estas garantías se comprueban en [`local-store.test.ts`](../course-tests/local-store.test.ts): instalación nueva, persistencia después de reiniciar, unicidad de `operation_id`, migración válida, interrupción con rollback, datos heredados inválidos y conservación de operaciones con problemas.
