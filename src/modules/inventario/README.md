# inventario

Sedes, bloques, tipos de espacio, espacios y elementos. Las fotos viven en `modules/fotografias`.

## Público (sin sesión)

`GET /sedes`, `/sedes/:sede/bloques`, `/sedes/:sede/bloques/:bloque`, `/espacios`, `/espacios/:codigo`, `/tipos-espacio`.
Solo muestran lo activo.

## Administración (rol ADMINISTRADOR)

| Recurso | Rutas | Regla de archivado |
|---|---|---|
| Sedes | `GET /sedes/gestion`, `POST /sedes`, `GET·PATCH /sedes/:id`, `PATCH /sedes/:id/archivar·restaurar` | 409 `SEDE_CON_BLOQUES` |
| Bloques | `GET·POST /bloques`, `GET·PATCH /bloques/:id`, `PATCH /bloques/:id/archivar·restaurar` | 409 `BLOQUE_CON_ESPACIOS` |
| Tipos de espacio | `GET /tipos-espacio/gestion`, `POST /tipos-espacio`, `GET·PATCH /tipos-espacio/:id`, `PATCH .../archivar·restaurar` | 409 `TIPO_CON_ESPACIOS` |
| Espacios | `POST /espacios`, `PATCH /espacios/:codigo`, `PATCH /espacios/:codigo/archivar` | 409 `ESPACIO_CON_RESERVAS` |
| Elementos | `GET·POST /elementos`, `GET·PATCH /elementos/:id`, `PATCH /elementos/:id/baja` | se da de baja, no se borra |

Reglas comunes: nada se borra; el código de sedes, bloques, tipos y espacios no cambia; todo cambio queda en la
bitácora con `@Auditar`; los listados son paginados (`?pagina&porPagina`) y aceptan `activo`.
