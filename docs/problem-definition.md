# Definición del problema — CampusOps

## Problema

Los estudiantes y el personal ficticios necesitan reportar incidencias universitarias, como fallas eléctricas, daños en laboratorios, fugas de agua, problemas de conectividad, equipos descompuestos, riesgos de seguridad y necesidades de mantenimiento. El personal responsable necesita clasificarlas, priorizarlas, asignarlas, atenderlas y cerrarlas desde una misma aplicación. CampusOps permite dar seguimiento a cada reporte y conservar un historial verificable de responsables, notas, evidencias y cambios de estado, evitando que una incidencia quede sin atención o sin una resolución documentada.

## Alcance

### Incluye

- Registro de incidencias con categoría, descripción y ubicación ficticia.
- Consulta de reportes y seguimiento de sus estados.
- Clasificación, priorización, asignación o reasignación de incidencias a técnicos.
- Inicio de atención, registro de diagnóstico y resolución por el técnico, así como cierre o reapertura por coordinación.
- Registro y consulta de notas, evidencias sintéticas e historial de cambios de acuerdo con los permisos de cada perfil.

### No incluye

- No es un sistema de emergencias.
- No utiliza datos reales de personas, instalaciones, ubicaciones, fotografías ni credenciales.
- No se implementará la aplicación completa durante esta semana.
- No se incluyen todavía el inicio de sesión ni todas las pantallas de la aplicación.
- No incluye chat en tiempo real, pagos ni integración con sistemas institucionales reales.

## Actores y responsabilidades

- **Reportante:** crea una incidencia, elige su categoría, describe el problema, indica una ubicación ficticia, agrega evidencia preparada para el ejercicio y consulta sus reportes.
- **Técnico:** consulta las incidencias que tiene asignadas, inicia la atención y registra el diagnóstico, las notas, las evidencias sintéticas y la resolución.
- **Coordinador:** revisa y prioriza las incidencias, asigna o reasigna técnicos, consulta el historial y las evidencias, y cierra o reabre casos según el resultado de la atención.

## Flujo principal

1. **Reportar:** el reportante registra la categoría, la descripción y la ubicación ficticia de la incidencia; el caso queda abierto para su revisión.
2. **Asignar:** coordinación revisa y prioriza la incidencia, y la asigna a un técnico responsable.
3. **Atender:** el técnico inicia el trabajo, registra el diagnóstico, agrega notas o evidencias sintéticas y marca la resolución.
4. **Cerrar:** coordinación verifica la resolución y cierra el caso; si la atención no es suficiente, puede reabrirlo para continuar el seguimiento.

## Criterios de aceptación verificables

1. Dado que un reportante captura una categoría, una descripción y una ubicación ficticia válidas, cuando registra el reporte, entonces la incidencia se muestra con esos datos y con el estado `open`.
2. Dado que existe una incidencia en estado `open`, cuando coordinación asigna un técnico, entonces la incidencia muestra al técnico asignado, cambia al estado `assigned` y conserva el cambio en su historial.
3. Dado que una incidencia está asignada a un técnico, cuando ese técnico inicia la atención, entonces la incidencia cambia al estado `in_progress` y registra el cambio en su historial.
4. Dado que una incidencia está en atención, cuando el técnico registra un diagnóstico y una resolución, entonces la información queda asociada al caso y su estado cambia a `resolved`.
5. Dado que una incidencia está en estado `resolved`, cuando coordinación verifica la resolución, entonces puede cambiarla a `closed` o reabrirla en estado `assigned`, y la decisión queda registrada en el historial.
