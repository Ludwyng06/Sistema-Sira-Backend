# reservas

solicitudes, ítems, máquina de estados, UC-01, UC-02

Estado:
- `dominio/maquina-estados.ts`: tabla de transiciones.
- Solicitudes: `POST /api/solicitudes` (borrador), `GET /api/solicitudes?ambito=PROPIAS|BANDEJA` (paginada; la bandeja lista lo enviado que el rol debe revisar, `403 SIN_BANDEJA` si no aplica), `GET /api/solicitudes/:id` (detalle con reservas, servicios, decisiones y última cotización; dueño, responsable de sus espacios, aprobador de su dependencia, tesorería, administración y auditoría; nunca borradores ajenos; fuera de alcance = 404) y `PATCH /api/solicitudes/:id` (solo BORRADOR, `409 SOLICITUD_NO_EDITABLE`).
- Ítems: `POST/DELETE /api/solicitudes/:id/reservas` y `/servicios` (solo dueño, solo BORRADOR; valor estimado con el tarifario).
- UC-01 `POST /api/solicitudes/:id/enviar`: correo verificado (RN-09), horario (RN-19), anticipación (RN-04), aforo (RN-18), póliza (RN-20), exención RN-07 y tarifa RN-10 decididas por el servidor, consecutivo `SOL-`, franjas `RETENIDA` con montaje y desmontaje, plazo de revisión (RN-02), historial y bitácora, todo en una transacción. `422 SOLICITUD_INCOMPLETA` con `detalles.problemas`; `409 FRANJA_NO_DISPONIBLE` con `detalles.conflictos`.
- Cancelación `POST /api/solicitudes/:id/cancelar` (RN-14): dueño o administración; solo CONFIRMADA con el evento sin empezar; libera franjas; reembolso según `politica_cancelacion` y días de antelación (100 % si la causa es institucional, 0 en exentas); `409 SOLICITUD_NO_CANCELABLE`.
- UC-02 `POST /api/solicitudes/:id/decisiones` (RESPONSABLE_ESPACIO da AVAL; APROBADOR de la dependencia dueña da APROBACION): el aval aprobado no cambia el estado; la aprobación emite la cotización `COT-` con desglose congelado (RN-05) y deja COTIZADA, o CONFIRMADA si es exenta (con valor de referencia, RN-08); RECHAZADA y DEVUELTA liberan las franjas (la devuelta las desvincula del ítem para poder reenviar); RECLASIFICADA cobra como persona natural. Fuera de alcance = 404; `409 SOLICITUD_NO_DECIDIBLE`; `422 MOTIVO_REQUERIDO`, `AVAL_PENDIENTE`.

Supuestos por confirmar: RECLASIFICADA emite de inmediato la cotización como persona natural; el depósito (RN-13) no aplica a exentas; el plazo de pago se recorta por la anticipación del evento.

- Documentos `POST|GET|DELETE /api/solicitudes/:id/documentos` y `GET .../:documentoId/archivo`: multipart PDF/PNG/JPG de hasta 10 MB con el tipo validado por el contenido, máximo 15 por solicitud; subir y quitar solo el dueño en BORRADOR; listar y descargar quien ve la solicitud. Los archivos pasan por `AlmacenamientoPort` (adaptador local en desarrollo, variable `ALMACENAMIENTO_DIR`; el adaptador S3 queda pendiente de la elección de imagen).
- Job de vencimientos (`jobs/vencimientos.service.ts`, cada 5 min con `@nestjs/schedule`): vence EN_REVISION, COTIZADA y PAGO_PENDIENTE cuyo `venceEn` pasó (RN-02), libera franjas, anula órdenes pendientes y avisa al solicitante; una orden EN_VERIFICACION no vence.

Pendiente: ninguno del plan.

- `GET /api/solicitudes/:id/cotizacion.pdf`: PDF tamaño carta de la última cotización (`pdfkit`, sin navegador): consecutivos, vigencia, evento, espacios y servicios, subtotal, IVA, depósito y total; en exentas, el valor de referencia. Lo descarga quien ve la solicitud; sin cotización, 404.
- Job de recordatorios (`jobs/recordatorios.service.ts`, cada 5 min): a las `horas_recordatorio_aprobador` (24 h) de estar EN_REVISION avisa al responsable (si falta su aval) o a los aprobadores de la dependencia, y a las `horas_escalamiento_aprobador` (48 h) escala a administración. Cada aviso queda una sola vez en la bitácora (`RECORDATORIO_REVISION`, `ESCALAMIENTO_REVISION`).

Sugerencias (RN-18, UC-01 paso 6): el `409 FRANJA_NO_DISPONIBLE` trae `detalles.sugerencias` por reserva y cada problema `AFORO_EXCEDIDO` de `422 SOLICITUD_INCOMPLETA` trae `sugerencias`, con hasta 5 espacios libres en ese mismo horario donde caben los asistentes (vía `BusquedaService`). Si la búsqueda falla, el error original se entrega igual con la lista vacía.

Advertencias (RN-18, no bloqueante): `POST /solicitudes/:id/enviar` devuelve `advertencias` (`ESPACIO_SOBRADO`, con alternativas) cuando el aforo es menos del 30 % de la capacidad de un espacio grande (80 o más).
