# actas

entrega, devolución, novedades

Estado: UC-05 implementado.

- `POST /api/actas` (RESPONSABLE_ESPACIO de un espacio de la solicitud): acta de ENTREGA (`CONFIRMADA` → `EN_USO`) o de DEVOLUCION (`EN_USO` → `FINALIZADA`). El checklist se arma con los elementos en servicio de los espacios de la solicitud: debe cubrirlos todos (`422 CHECKLIST_INVALIDO`); `ok` lo calcula el servidor (cantidad completa y estado no MALO). En la devolución cada elemento incompleto o en mal estado exige una novedad (`422 NOVEDAD_REQUERIDA`) con valor y tratamiento (`DESCONTAR_DEPOSITO`, `COBRO_ADICIONAL` o `SIN_COBRO`). Consecutivo `ACT-`; una de cada tipo por solicitud (`409 ACTA_YA_REGISTRADA`); `409 ACTA_NO_PERMITIDA` si el estado no corresponde.
- `GET /api/actas/:id`: solicitante de la solicitud, responsable del espacio, administración y auditoría; otro = 404.
- Historial de estados y bitácora (`ACTA_ENTREGA_REGISTRADA`, `ACTA_DEVOLUCION_REGISTRADA`) en la misma transacción.

Pendiente: PDF del acta, fotos y firmas (dependen del adaptador de almacenamiento S3 y de la carga de imágenes), aplicación del descuento al depósito o cobro adicional según el tratamiento de las novedades, y cierre (`CERRAR`, RN-15).

- `GET /api/actas/:id.pdf`: PDF tamaño carta del acta (checklist, novedades, observaciones y espacios para las firmas), con el mismo alcance que el detalle. Usa `shared/pdf/formato-pdf.ts`, compartido con la cotización.
