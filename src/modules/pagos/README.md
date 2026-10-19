# pagos

órdenes, consignación, puerto de pasarela, webhooks

Estado: UC-03 por consignación implementado.

- `POST /api/pagos/ordenes` (dueño): orden `OP-` por total de la cotización más depósito, con la cuenta de `cuenta_recaudo`; la solicitud pasa a `PAGO_PENDIENTE`. Devuelve la orden pendiente si ya existe; `422 SOLICITUD_EXENTA` (RN-08), `409 ORDEN_NO_PERMITIDA` o `COTIZACION_VENCIDA`.
- `POST /api/pagos/ordenes/:id/soporte` (dueño): comprobante PDF/PNG/JPG de hasta 10 MB validado por contenido; la orden queda `EN_VERIFICACION` (no vence).
- `POST /api/pagos/ordenes/:id/verificacion` (TESORERIA): aprobar confirma la orden, la solicitud (RN-11) y las franjas; rechazar exige observación y deja la solicitud en `PAGO_PENDIENTE` para generar otra orden.
- `GET /api/pagos/ordenes` (TESORERIA, AUDITOR): conciliación paginada con filtro por estado; `GET /api/pagos/ordenes/:id/soporte`: su dueño, tesorería y auditoría.
- Todo escribe bitácora (`ORDEN_PAGO_CREADA`, `SOPORTE_PAGO_CARGADO`, `PAGO_APROBADO`, `PAGO_RECHAZADO`).

`puertos/pasarela.port.ts` solo define el puerto (etapa 2): no se implementa.

Deuda técnica por confirmar con Jensen: este módulo lee y actualiza solicitud, cotización y franjas con Prisma directamente; la regla del plan es usar servicios exportados de `reservas` y `disponibilidad`.

Pendiente: vencimiento de órdenes y reembolsos (job), pago tardío (RN-02d), correos y notificaciones, orden de servicio para entidades públicas.

- `POST /api/pagos/ordenes/:id/pago-tardio` (TESORERIA, RN-02d): pago recibido tras vencer la orden. Si las franjas siguen libres se vuelven a ocupar y la solicitud pasa de `VENCIDA` a `CONFIRMADA`; si ya no, la orden queda aprobada, se crea un `Reembolso` por el valor total y se avisa a tesorería y al solicitante. `409 PAGO_TARDIO_NO_APLICA` si la orden o la solicitud no están vencidas.
