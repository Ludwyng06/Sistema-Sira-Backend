# disponibilidad

franjas, bloqueos, calendario, búsqueda inversa

Estado:

- `GET /api/disponibilidad` (`espacioId`, `desde`, `hasta`): franjas retenidas, confirmadas o bloqueadas que cruzan `[desde, hasta)`, filtradas con `periodo && tstzrange(...)`. El público ve solo estado y etiqueta («Ocupado» o la etiqueta pública), nunca datos personales. Máximo 62 días.
- `GET /api/disponibilidad/sede` (`sede`, `bloque?`, `desde`, `hasta`): horas de operación, horas ocupadas y porcentaje por espacio y en total. Solo cifras. Máximo 31 días.
- `GET /api/disponibilidad/buscar` (`fecha`, `horaInicio`, `horaFin`, `asistentes`, `sedeId?`): espacios libres donde caben los asistentes, del mejor ajuste al peor.
- `POST /api/bloqueos` (ADMINISTRADOR, RESPONSABLE_ESPACIO): bloqueo con RRULE opcional expandido en franjas `BLOQUEO` (máx. 366 ocurrencias); `409 FRANJA_NO_DISPONIBLE` con los conflictos; bitácora `BLOQUEO_CREADO`.
- `POST /api/bloqueos/importar-horario` (ADMINISTRADOR): CSV con espacio, dia, horaInicio, horaFin, desde, hasta y descripcion; crea bloqueos de clase semanales. Lo que choca con una reserva o con otro bloqueo se omite y queda en el reporte de conflictos para reprogramar (RN-03); las filas inválidas quedan en el reporte de errores; bitácora `HORARIO_IMPORTADO`.

Supuestos: la ocupación por sede cuenta los días calendario completos que toca el rango; el CSV se lee en UTF-8 con coma o punto y coma; los festivos no se descuentan de las horas de operación.

Pendiente: ninguno del plan.

- `PATCH /api/bloqueos/:id/anular` (ADMINISTRADOR, RESPONSABLE_ESPACIO en su alcance): marca `anuladoEn` y libera las franjas que aún no terminaron; las pasadas quedan como histórico; bitácora `BLOQUEO_ANULADO`; `409 BLOQUEO_YA_ANULADO`.
