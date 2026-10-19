# notificaciones

correo (plantillas), notificaciones en la app

Estado:

- Puerto hexagonal de correo y adaptador SMTP (`correo/`).
- `NotificacionesService`: `notificarUsuario`, `notificarSolicitante` y `notificarAprobadores` guardan la notificación en la aplicación y envían el correo; nunca lanzan (una falla al notificar no deshace el cambio de estado, queda en el registro).
- `GET /api/notificaciones?soloNoLeidas&pagina&porPagina` (propias, con contador `noLeidas`) y `PATCH /api/notificaciones/:id/leida` (204, idempotente; ajena = 404).
- Se notifica en: envío (al solicitante y a los responsables de los espacios), aval (a los aprobadores), decisión (aprobada, confirmada, rechazada, devuelta), pago verificado o rechazado, actas de entrega y devolución, cancelación y vencimiento por plazo.

Pendiente: plantillas HTML editables (`PlantillaCorreo`), recordatorios al aprobador (24 h y 48 h) y envío por cola (BullMQ); hoy el correo se envía en línea.
