# tarifario

tarifas, recargos, motor de cálculo

## Cálculo (público)

`POST /api/tarifas/calcular` (público, no persiste) y `TarifarioService.calcular()`, exportado para `reservas`.

- Tarifa vigente a la fecha de emisión (RN-05), tarifas en SMMLV resueltas con el valor del año (RN-06).
- Unidad de cobro más barata para el solicitante entre hora, jornadas y día; recargos nocturno, dominical y festivo; IVA por tarifa. Pesos enteros, desglose por día (Bogotá).
- Errores: `400 RANGO_INVALIDO`, `404 NO_ENCONTRADO`, `422 TARIFA_NO_DEFINIDA` o `SMMLV_NO_DEFINIDO`.
- La tarifa INTERNO no se acepta en el simulador público.

Supuestos por confirmar (documentados en `dominio/calculo.ts`): jornadas 06–12, 12–18 y 18–24; la hora se cobra completa; nocturno proporcional desde `desdeHora` y antes de las 06:00; festivo prevalece sobre dominical.

## Administración (solo ADMINISTRADOR, con `@Auditar`)

- `GET|POST /api/tarifas` y `PATCH /api/tarifas/:id`: una tarifa es de un espacio (con unidad de cobro) o de un servicio (sin unidad); `valor` en pesos o `valorEnSmmlv` (se resuelve con el salario del año de inicio, `422 SMMLV_NO_DEFINIDO`). Crear una tarifa nueva cierra la vigente de la misma combinación el día anterior en una transacción; si ya hay una que empieza ese día o después, `409 TARIFA_SOLAPADA`. El valor nunca se edita (RN-05): el PATCH solo cierra la vigencia (sin extenderla) y edita `acuerdoSoporte`. Listado paginado con filtros por espacio, servicio, tipo de solicitante y `vigentes`.
- `GET /api/recargos` y `PATCH /api/recargos/:tipo`: los tipos son fijos (NOCTURNO, DOMINICAL, FESTIVO); se edita porcentaje (0–100), activo y, solo en el nocturno, `desdeHora` (HH:MM). Si el recargo no estaba configurado, el porcentaje es obligatorio y se crea.
- `GET|POST /api/festivos` y `DELETE /api/festivos/:id` (el id es la fecha AAAA-MM-DD): lista por año, `409 FESTIVO_EXISTENTE`. Es el único borrado físico del módulo: un festivo no tiene histórico propio y las cotizaciones ya emitidas guardan su desglose congelado; la eliminación queda en la bitácora.

Pendiente: carga masiva de festivos por año y recálculo de tarifas indexadas al SMMLV cuando se registra el salario del año nuevo.
