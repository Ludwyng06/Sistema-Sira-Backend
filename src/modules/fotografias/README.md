# fotografias

fotos de espacios con variantes WebP

Estado:

- `POST /api/espacios/:id/fotos` (ADMINISTRADOR, RESPONSABLE_ESPACIO del espacio): imagen JPG o PNG de hasta 10 MB validada por contenido, con texto alternativo obligatorio. Genera tres variantes WebP (`detalle` 1280 px, `tarjeta` 480 px, `miniatura` 160 px; nunca agranda) con `sharp` y las guarda por `AlmacenamientoPort`. La primera foto es la portada; máximo 30 por espacio.
- `GET /api/fotos/:id/:variante` (público): sirve la variante con caché de un día. Las URL que el inventario público ya devuelve (`urlDetalle`, `urlTarjeta`, `urlMiniatura`) apuntan a este endpoint.
- `DELETE /api/espacios/:id/fotos/:fotoId`: borra la foto y sus variantes (único borrado físico del módulo, porque la tabla no tiene estado de archivo); si era la portada, la siguiente pasa a serlo.

Pendiente: fotos de elementos y de servicios (la tabla ya las admite), reordenamiento y cambio de portada sin volver a subir, y el adaptador S3 cuando se elija la imagen que reemplaza a MinIO.
