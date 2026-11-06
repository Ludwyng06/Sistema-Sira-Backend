# auditoria

consulta de la bitácora

Estado:

- `GET /api/auditoria` (ADMINISTRADOR, AUDITOR): bitácora paginada de la más reciente a la más antigua, filtrable por entidad, entidadId, acción, usuario y rango de fechas; incluye el correo del usuario.
- `@Auditar('ACCION', 'Entidad')` + `AuditarInterceptor` global: registra usuario, entidad, id, resultado resumido (máx. 4 000 caracteres), IP, user-agent y correlación cuando el método termina bien. Una falla al registrar no afecta la respuesta. Los casos de uso que ya escriben su bitácora dentro de la transacción no lo usan.

Pendiente: aplicar `@Auditar` a los CRUD de administración cuando existan, y exportación de la bitácora.
