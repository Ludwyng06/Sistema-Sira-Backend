# identidad

registro, login, verificación, roles, sesiones

Responsable: Isabel Cerón

Estado: contrato publicado en Swagger (`/docs`, etiqueta «Identidad»): los nueve endpoints de `/api/auth/*` validan la entrada y documentan sus errores.

Implementado: `POST /api/auth/registro` (política de datos vigente, perfil INTERNO por dominio institucional, dependencia solo para internos, duplicados de correo y documento, contraseña con Argon2id, usuario + rol SOLICITANTE + solicitante + consentimiento en una transacción y envío del código de verificación), y `POST /api/auth/verificar-correo` y `POST /api/auth/reenviar-codigo` delegados en `CodigoVerificacionService`.

Pendiente (responden 501 `NO_IMPLEMENTADO`): ingresar, refrescar, salir, recuperar, restablecer y yo. Se construye siguiendo el plan `docs/architecture/08-plan-de-trabajo-20-dias.md` y la estructura de `modules/inventario`.
