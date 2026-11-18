# identidad

registro, login, verificación, roles, sesiones

Responsable: Isabel Cerón

Estado: los nueve endpoints de `/api/auth/*` están implementados y documentados en Swagger (`/docs`, etiqueta «Identidad»); ya no responden 501.

- `POST /registro`, `/verificar-correo`, `/reenviar-codigo`: registro con política de datos, perfil INTERNO por dominio institucional y código de verificación (`CodigoVerificacionService`).
- `POST /ingresar`: compara con Argon2id; correo inexistente o inactivo ejecuta igual un verify de relleno (401 `CREDENCIALES_INVALIDAS`). Cada fallo incrementa `intentosFallidos` de forma atómica; al llegar a `max_intentos_ingreso` bloquea `minutos_bloqueo_ingreso` minutos, registra `CUENTA_BLOQUEADA` en bitácora y responde 429 `CUENTA_BLOQUEADA` con la hora de desbloqueo en America/Bogota. Un correo sin verificar puede ingresar.
- `POST /refrescar`: rota el token de refresco de la cookie `sira_refresh`; reusar un token revocado revoca toda la familia (401 `SESION_REVOCADA`). Si falla por sesión, limpia la cookie.
- `POST /salir`: revoca el token de la cookie y la borra; responde 204 aunque no haya cookie.
- `GET /yo`: usuario, roles y perfil de la sesión.
- `POST /recuperar` y `POST /restablecer`: delegados en `RecuperacionService`.

El access token (JWT) viaja en el cuerpo y el de refresco solo en la cookie `httpOnly`, `SameSite=Lax`, `Path=/api/auth` (`secure` en producción). Las sesiones las gestiona `SesionService`.
