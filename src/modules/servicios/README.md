# servicios

catálogo de servicios complementarios y proveedores

Estado:

- `GET /api/servicios` (público; filtro `tipoEspacioId` que incluye los servicios sin restricción de tipo; sin datos del proveedor).
- Administración (solo ADMINISTRADOR, escrituras con `@Auditar`; nada se borra, se desactiva):
  - `GET /api/proveedores`, `GET /api/proveedores/:id`, `POST /api/proveedores`, `PATCH /api/proveedores/:id`, `DELETE /api/proveedores/:id` (204). Contacto y porcentaje de administración son privados: solo salen aquí. `activo=false` (PATCH o DELETE) desactiva al proveedor y a todos sus servicios en la misma transacción; `activo=true` solo lo reactiva a él. `409 PROVEEDOR_DUPLICADO`.
  - `GET /api/servicios/gestion` (activos e inactivos; filtros `activo`, `categoria`, `proveedorId`, `buscar`), `GET /api/servicios/:id`, `POST /api/servicios`, `PATCH /api/servicios/:id`, `DELETE /api/servicios/:id` (204). El proveedor debe estar activo (`422 PROVEEDOR_INACTIVO`), el nombre no se repite dentro del proveedor (`409 SERVICIO_DUPLICADO`) y `tiposPermitidos` (vacío = todos los tipos) se reemplaza completo en PATCH (`422 TIPO_ESPACIO_INVALIDO`).

Supuestos por confirmar: la unicidad del nombre de servicio por proveedor y la de proveedores por nombre no distinguen mayúsculas; las rutas de administración de servicios usan `/servicios/gestion` para no chocar con el catálogo público `GET /servicios`.

Pendiente: tarifas por servicio (`/tarifas`, junto con las de espacios), fotografías del servicio y confirmación del proveedor sobre cada ítem solicitado.
