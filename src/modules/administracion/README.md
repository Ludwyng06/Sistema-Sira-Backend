# administracion

usuarios, dependencias y parámetros (solo ADMINISTRADOR)

Estado:

- **Usuarios** (`/api/usuarios`): `GET` paginado con filtros `rol`, `activo` y `busqueda` por correo (nunca devuelve contraseña ni secretos), `GET /:id`, `PATCH /:id/estado` y `PUT /:id/roles`.
  - Desactivar cierra todas las sesiones en la misma transacción y escribe bitácora; un administrador no se desactiva a sí mismo (`409 AUTODESACTIVACION`) ni deja el sistema sin administradores activos (`409 ULTIMO_ADMINISTRADOR`).
  - Reemplazar roles: APROBADOR exige dependencia (`422 DEPENDENCIA_REQUERIDA`); RESPONSABLE_ESPACIO la admite opcional; SOLICITANTE, ADMINISTRADOR, TESORERIA y AUDITOR no (`422 DEPENDENCIA_NO_ADMITIDA`); sin filas repetidas (`422 ROL_DUPLICADO`); la dependencia debe existir y estar activa. Cierra las sesiones para regenerar el JWT.
- **Dependencias** (`/api/dependencias`): `GET` paginado, `GET /:id`, `POST`, `PATCH /:id` (nombre, centro de costo, jefe; el código no cambia), `PATCH /:id/archivar` y `PATCH /:id/restaurar` (204, idempotentes). El jefe debe ser un usuario activo (`422 JEFE_NO_VALIDO`); código único (`409 CODIGO_REGISTRADO`); no se archiva con espacios activos (`409 DEPENDENCIA_CON_ESPACIOS`).
- **Parámetros** (`/api/parametros`): `GET` y `PATCH /:clave`. El nuevo valor conserva la forma del actual (número no negativo, texto, booleano, lista, objeto con las mismas claves); `politica_cancelacion` (tramos `{ diasAntes, porcentaje 0-100 }` con un tramo de 0 días) y `cuenta_recaudo` (banco, tipo, numero, titular, nit) tienen validación propia. Clave inexistente: 404. El valor anterior queda en la bitácora.
- Toda mutación escribe bitácora dentro de la transacción (`USUARIO_ACTIVADO`, `USUARIO_DESACTIVADO`, `USUARIO_ROLES_REEMPLAZADOS`, `DEPENDENCIA_*`, `PARAMETRO_ACTUALIZADO`).

Supuestos por confirmar: al reemplazar roles las filas anteriores de `UsuarioRol` se eliminan físicamente (el histórico queda en la bitácora); no se crean usuarios desde aquí (el alta es el registro público); un usuario se queda sin rol SOLICITANTE si no se incluye en la lista.

Pendiente: alta de usuarios internos por administración, restablecimiento forzado de contraseña y TOTP para administradores (RF-AUT-09, fase posterior).
