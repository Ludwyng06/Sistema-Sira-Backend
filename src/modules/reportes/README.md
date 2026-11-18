# reportes

indicadores y exportaciones

Estado: `GET /api/reportes/tablero` (ADMINISTRADOR, APROBADOR, TESORERIA, AUDITOR; solo lee). Parámetros `desde` y `hasta` (por defecto los últimos 30 días, máximo 366). Devuelve solicitudes por estado, horas reservadas y bloqueadas con los diez espacios más usados, recaudo aprobado, tiempo medio de aprobación en horas y valor de referencia del uso interno no cobrado. El aprobador ve solo las dependencias de su alcance.

Pendiente: exportaciones XLSX, CSV y PDF (`GET /reportes/:tipo.xlsx`), porcentaje de ocupación frente a las horas de operación y comparación contra periodos anteriores.

Exportaciones: `GET /api/reportes/:tipo.xlsx` y `GET /api/reportes/:tipo.csv` (tipos `solicitudes`, `recaudo` y `ocupacion`; `desde` y `hasta` como el tablero; hasta 10 000 filas). El aprobador solo exporta lo de su alcance y no el recaudo (`403 SIN_PERMISO`). El CSV va en UTF-8 con BOM. Nunca incluyen documento, teléfono ni correo del solicitante (`exceljs` para XLSX).
