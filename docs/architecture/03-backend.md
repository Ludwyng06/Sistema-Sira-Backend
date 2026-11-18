# SIRA - Backend

> NestJS 12 (ESM, TypeScript) · Prisma 7 con `@prisma/adapter-pg` · PostgreSQL 16 · BullMQ sobre Redis.
> Código en la raíz del repositorio Backend. Documentación interactiva de la API en `http://localhost:3001/docs` (OpenAPI generado del código, RNF-17).

## 1. Estructura de módulos

Monolito modular. Cada módulo es un contexto del dominio y se organiza igual:

```
src/
├─ main.ts                      arranque: Helmet, CORS, ValidationPipe, Swagger, prefijo /api
├─ app.module.ts
├─ generated/prisma/            cliente generado por Prisma (no se edita, no se versiona)
├─ shared/
│  ├─ config/                   validación de variables de entorno
│  ├─ prisma/                   PrismaService (un solo cliente para toda la app)
│  ├─ auth/                     guardas JWT y de roles, decoradores @Publico, @Roles, @UsuarioActual
│  ├─ errores/                  ErrorDominio y filtro global (traduce a HTTP)
│  ├─ auditoria/                interceptor global que escribe la bitácora
│  ├─ consecutivos/             ConsecutivoService (RN-17)
│  └─ tiempo/                   utilidades de zona horaria y días hábiles
└─ modules/
   ├─ identidad/                registro, login, verificación, roles, sesiones
   ├─ inventario/               sedes, bloques, espacios, elementos, fotos  ← MÓDULO DE EJEMPLO
   ├─ servicios/                catálogo complementario, proveedores
   ├─ tarifario/                tarifas, recargos, motor de cálculo
   ├─ disponibilidad/           franjas, bloqueos, calendario, búsqueda inversa
   ├─ reservas/                 solicitudes, ítems, máquina de estados, cotización
   ├─ aprobaciones/             aval, aprobación, escalamiento (la lógica vive en reservas/: ver su README)
   ├─ pagos/                    órdenes, consignación, puerto de pasarela, webhooks
   ├─ actas/                    entrega, devolución, novedades
   ├─ notificaciones/           correo (plantillas), notificaciones en la app
   ├─ reportes/                 indicadores y exportaciones
   └─ auditoria/                consulta de la bitácora
```

Dentro de cada módulo:

```
modules/inventario/
├─ inventario.module.ts
├─ controllers/       HTTP: valida entrada (DTO), llama al servicio, devuelve. CERO reglas de negocio.
├─ dto/               clases con class-validator (lo que entra) y tipos de respuesta (lo que sale)
├─ services/          casos de uso y reglas de negocio (RNF-16)
└─ *.spec.ts          pruebas unitarias junto al archivo que prueban
```

**Regla de dependencias:** un módulo usa a otro solo a través de su servicio exportado, nunca leyendo sus tablas directamente. Ejemplo: `reservas` le pide a `disponibilidad.retenerFranjas()` y a `tarifario.calcular()`; no hace `prisma.franjaOcupada.create` por su cuenta.

> ⚠️ El documento base pide "arquitectura hexagonal". Con 20 días y un equipo que está aprendiendo NestJS, se aplica **solo donde aporta**: el **puerto de pagos** (`PasarelaPort`), el de almacenamiento (`AlmacenamientoPort`) y el de correo (`CorreoPort`) tienen interfaz y adaptadores intercambiables. El resto usa servicios de NestJS con Prisma directamente. Ver `07`.

## 2. Autenticación y autorización

### 2.1 Autenticación (RF-AUT-01 a 10)

| Flujo | Detalle |
|---|---|
| Registro | `POST /auth/registro`. Exige aceptar la política de datos (se registra versión, IP y fecha). Si el dominio del correo está en `Parametro.dominios_institucionales`, la cuenta queda `esInstitucional=true` y su perfil `INTERNO`. |
| Verificación | Código de 6 dígitos, válido 15 min, máximo 5 intentos. Sin verificar no se puede enviar solicitudes. **RN-09:** sin verificación no hay exención. |
| Login | Devuelve un **access token** JWT (15 min) en el cuerpo y un **refresh token** (7 días) en cookie `httpOnly`, `secure`, `sameSite=lax`. |
| Refresco | `POST /auth/refrescar`. Rota el token: el viejo se revoca. Si llega un token ya revocado de la misma familia, se revoca toda la familia (robo de sesión). |
| Bloqueo | 5 intentos fallidos → bloqueo de 15 min y registro en bitácora (RF-AUT-10). |
| Recuperación | Enlace de un solo uso, 30 min. Respuesta idéntica exista o no el correo. |
| Contraseñas | Argon2id. Mínimo 10 caracteres. |
| Segundo factor | TOTP para `ADMINISTRADOR` y `TESORERIA` (RF-AUT-09). **Fase posterior.** |

### 2.2 Autorización

Dos niveles, y los dos son obligatorios:

1. **Por rol** (guarda global `RolesGuard` + decorador `@Roles(...)`), según la matriz 3.2 del documento base.
2. **Por recurso**: el servicio verifica que *este* usuario pueda tocar *este* registro. Un solicitante que cambie el id en la URL recibe `404`, no `403` (no se confirma que el recurso exista).

| Rol | Alcance del recurso |
|---|---|
| Solicitante | Solo sus solicitudes, pagos y actas. |
| Responsable de espacio | Solicitudes que incluyen espacios donde `responsableId` = él. |
| Aprobador | Solicitudes de espacios cuya dependencia dueña tiene como jefe a él, o donde tiene `UsuarioRol(APROBADOR, dependenciaId)`. |
| Tesorería, Administrador, Auditor | Todo (el auditor solo lectura). |

**Corrección a la matriz del documento base:** el solicitante necesita **crear** la orden de pago de su propia solicitud y **cargar el soporte** de consignación. Se le da `C` sobre sus propios pagos.

## 3. Reglas de negocio

Frases verificables; cada una debe tener al menos una prueba. Las marcadas con ✏️ ajustan el documento base (justificación en `07`).

| ID | Regla |
|---|---|
| RN-01 | Un espacio no puede tener dos franjas activas solapadas. Lo garantiza la restricción `sin_solapamiento`; el servicio traduce el error `23P01` a `409 FRANJA_NO_DISPONIBLE` con las franjas en conflicto. |
| RN-02 ✏️ | **Dos plazos distintos.** (a) *Plazo de revisión:* al enviar, las franjas quedan `RETENIDA` hasta `enviadaEn + horas_plazo_revision` (72 h). El aprobador recibe recordatorio a las 24 h y se escala a las 48 h, **antes** de que venza. (b) *Plazo de pago:* al quedar `COTIZADA`, el solicitante externo tiene `horas_plazo_pago` (48 h). Ningún plazo puede ir más allá del inicio del evento menos la anticipación mínima. |
| RN-02c ✏️ | Una orden con transacción de pasarela en `PENDIENTE` no vence: se extiende hasta `minutos_gracia_pago_pendiente` (120 min) mientras se consulta su estado. |
| RN-02d ✏️ | **Pago tardío.** Si llega un pago aprobado para una solicitud ya `VENCIDA`: si las franjas siguen libres se vuelven a ocupar y se confirma; si no, se marca para reembolso total automático y se notifica a tesorería y al solicitante. |
| RN-03 | Clases, mantenimientos y festivos ocupan franjas `BLOQUEO` en la misma tabla, por lo que ninguna solicitud puede tomarlas. La importación del horario académico que choque con reservas confirmadas genera un reporte de conflictos para reprogramar. |
| RN-04 ✏️ | La anticipación mínima depende del tipo de espacio y se cuenta en días hábiles cuando así se configura. Valores iniciales: aula y sala de informática 2 días hábiles; laboratorio 3; auditorio y escenario deportivo 2 ⚠️ (Vicerrectoría mencionó "unos dos días"; el doc sugería 8). |
| RN-05 | La tarifa aplicada es la vigente al emitir la cotización. La cotización guarda el desglose congelado. |
| RN-06 | Las tarifas en SMMLV se recalculan con el valor del año de la cotización (`Smmlv`). |
| RN-07 ✏️ | Exenta si y solo si: (a) correo de dominio institucional **verificado**, (b) declara uso institucional, (c) asociada a una dependencia, (d) con aval aprobado de esa dependencia. Mientras el aval está pendiente se muestra $0 provisional. Si el aval se niega, la solicitud **se rechaza** (no se convierte en cobro automáticamente: el interno decide si la reenvía como uso particular). |
| RN-07e ✏️ | Estudiantes: pueden solicitar con uso institucional; el aval (d) lo da un docente o el jefe del programa asociado, y luego sigue la aprobación normal. ⚠️ |
| RN-08 | En una solicitud exenta la sección de pago no existe en ninguna pantalla ni respuesta de la API. `POST /pagos/ordenes` responde `422 SOLICITUD_EXENTA`. Sí se calcula `valorReferencia`. |
| RN-09 | Sin correo verificado no hay exención ni envío de solicitudes. |
| RN-10 ✏️ | Un interno que declara uso particular o para un tercero paga la **tarifa de persona natural**. La declaración queda en bitácora. (El doc decía "tarifa externa" aquí y "persona natural" en la tabla 5.1; se unifica.) |
| RN-11 | Confirmada solo con pago aprobado (externos) o con aprobación final (exentas). |
| RN-12 | El estado de una transacción lo define solo el webhook con firma válida (o la consulta activa al proveedor), nunca la redirección del navegador. |
| RN-13 | Espacios con depósito exigen ese valor adicional en la cotización; se devuelve tras un acta de devolución sin novedades. |
| RN-14 | Cancelación según `politica_cancelacion`; por causa institucional, 100 %. |
| RN-15 | No se cierra una solicitud sin acta de devolución. |
| RN-16 | Espacio `FUERA_DE_SERVICIO`: no aparece en el calendario público, no admite solicitudes, y las reservas confirmadas se notifican para reprogramar. |
| RN-17 | Consecutivos únicos, secuenciales y nunca reutilizados (`ConsecutivoService`). |
| RN-18 ✏️ | Aforo > capacidad: se bloquea el envío y se sugieren espacios con capacidad suficiente libres en esa franja. **Nuevo:** si el aforo es menor al 30 % de la capacidad de un espacio grande (auditorio, coliseo), se muestra una advertencia no bloqueante con alternativas más pequeñas. ⚠️ |
| RN-19 🆕 | Una franja debe caer dentro del horario de operación del espacio para ese día. |
| RN-20 🆕 | Si el aforo supera `TipoEspacio.aforoExigePoliza`, la póliza es documento obligatorio para enviar. |

### 3.1 Tabla de decisión de cobro (corregida)

| Correo | Verificado | Declara | Aval | Tarifa | Pasarela |
|---|---|---|---|---|---|
| Institucional | Sí | Institucional | Aprobado | $0 + valor de referencia | No |
| Institucional | Sí | Institucional | Pendiente | $0 provisional | No |
| Institucional | Sí | Institucional | Negado | — (solicitud rechazada) | No |
| Institucional | Sí | Particular | No aplica | Persona natural | Sí |
| Institucional | No | Cualquiera | — | No puede enviar hasta verificar | — |
| Externo | Sí | — | — | Según tipo de solicitante | Sí |
| Externo, entidad pública | Sí | — | — | Entidad | Sí, u orden de servicio |

## 4. Casos de uso principales

### UC-01 · Enviar solicitud (`POST /solicitudes/:id/enviar`)

1. Verifica que la solicitud es del usuario y está en `BORRADOR`, que el correo está verificado y que los documentos obligatorios están cargados.
2. Por cada ítem valida: espacio reservable y no fuera de servicio, horario de operación (RN-19), anticipación (RN-04), aforo (RN-18).
3. Evalúa RN-07 → fija `esExenta` provisional y `tipoTarifa`.
4. Calcula el valor estimado con `TarifarioService.calcular()`.
5. **En una transacción:** toma consecutivo `SOL-`, crea las `FranjaOcupada` en `RETENIDA` (con montaje y desmontaje), cambia el estado a `ENVIADA` → `EN_REVISION`, fija `venceEn`, escribe el historial.
6. Si la BD responde `23P01`, devuelve `409` con las franjas en conflicto y sugerencias.
7. Encola el correo al solicitante y la notificación a responsables y aprobador.

### UC-02 · Decidir (`POST /solicitudes/:id/decisiones`)

Quien decide: el responsable (tipo `AVAL`) y luego el aprobador (`APROBACION`). Si un espacio no `requiereAval`, se salta el aval.

- `APROBADA` (aval): queda pendiente la aprobación.
- `APROBADA` (aprobación): se emite la cotización (`COT-`, PDF) → `COTIZADA`. Si es exenta → `CONFIRMADA` y las franjas pasan a `CONFIRMADA`.
- `RECHAZADA`: motivo obligatorio, franjas `LIBERADA` → `RECHAZADA`.
- `DEVUELTA`: motivo obligatorio, franjas `LIBERADA` → `BORRADOR`.
- `RECLASIFICADA`: motivo obligatorio, `esExenta=false`, `tipoTarifa=PERSONA_NATURAL`, recálculo; sigue el flujo de externos.

### UC-03 · Pagar por consignación (MVP)

1. `POST /pagos/ordenes` → crea `OrdenPago` con referencia `OP-2026-000001`, medio `CONSIGNACION`, `venceEn` = plazo de pago. Responde con los datos de la cuenta de recaudo (`Parametro.cuenta_recaudo`) y la referencia que el solicitante debe escribir en la consignación.
2. `POST /pagos/ordenes/:id/soporte` → carga el comprobante → `EN_VERIFICACION`.
3. Tesorería: `POST /pagos/ordenes/:id/verificacion` con `aprobada` o `rechazada` + observación. Si se aprueba → solicitud `CONFIRMADA`, franjas `CONFIRMADA`.

### UC-04 · Pagar por pasarela (fase posterior)

Exactamente como dice la sección 9.4 y 11.1 del documento base: `PasarelaPort` con adaptadores, webhook que guarda el evento crudo, valida firma, responde en < 2 s y delega a la cola; idempotencia por `(proveedor, idEventoExterno)`; consulta activa a los 30 min de pendiente.

### UC-05 · Entrega y devolución

`POST /actas` con tipo `ENTREGA` (solicitud `CONFIRMADA` → `EN_USO`) o `DEVOLUCION` (`EN_USO` → `FINALIZADA`). El checklist se arma desde los elementos del espacio. Las novedades con valor generan descuento del depósito o cobro adicional.

## 5. Endpoints

Prefijo global `/api`. Autenticación `Bearer` salvo los marcados 🌐 (públicos). Paginación estándar: `?pagina=1&porPagina=20` → `{ datos, total, pagina, porPagina }`.

| Método | Ruta | Quién | Descripción |
|---|---|---|---|
| GET | `/salud` | 🌐 | Estado de la API y la BD. |
| POST | `/auth/registro` | 🌐 | Crea cuenta + perfil + consentimiento. |
| POST | `/auth/verificar-correo` | 🌐 | Código de 6 dígitos. |
| POST | `/auth/reenviar-codigo` | 🌐 | Máx. 1 por minuto. |
| POST | `/auth/ingresar` | 🌐 | Access token + cookie de refresco. |
| POST | `/auth/refrescar` | 🌐 (cookie) | Rota el refresh. |
| POST | `/auth/salir` | Autenticado | Revoca la sesión. |
| POST | `/auth/recuperar` · `/auth/restablecer` | 🌐 | Recuperación de contraseña. |
| GET | `/auth/yo` | Autenticado | Usuario, roles, perfil. |
| GET | `/sedes` | 🌐 | Sedes con conteo de bloques y espacios. |
| GET | `/sedes/:sede/bloques` | 🌐 | Bloques de una sede (por código, ej. `MOC`) con conteo por tipo de espacio. |
| GET | `/sedes/:sede/bloques/:bloque?asistentes=` | 🌐 | Bloque (por código, ej. `A`) con plano y sus espacios agrupados por piso. Con `asistentes` oculta los que no caben y ordena por ajuste. |
| GET | `/espacios` | 🌐 | Filtros: `sede`, `bloque`, `tipo`, `asistentes`, `pagina`, `porPagina` (códigos). |
| GET | `/espacios/:codigo` | 🌐 | Ficha: fotos, elementos, condiciones, tarifas públicas. |
| GET | `/tipos-espacio` | 🌐 | Tipos de espacio activos y sus reglas de anticipación. |
| POST · PATCH | `/espacios` · `/espacios/:codigo` | Admin | Crear y modificar. El código y el bloque no cambian. Pasar a `FUERA_DE_SERVICIO` avisa a quienes tienen reservas futuras (RN-16). |
| PUT | `/espacios/:codigo/horarios` | Admin | Reemplaza el horario de operación (RN-19). Lista vacía = sin restricción. |
| PATCH | `/espacios/:codigo/archivar` | Admin | 204. Archivar en vez de borrar; 409 si hay reservas futuras. |
| POST · DELETE | `/espacios/:id/fotos` · `/espacios/:id/fotos/:fotoId` | Admin, Responsable | Multipart, máx. 10 MB, genera variantes WebP. |
| GET | `/fotos/:id/:variante` | 🌐 | Sirve la variante de una foto. |
| GET · POST · PATCH | `/sedes/gestion` · `/sedes` · `/sedes/:id` | Admin | Listado (activas y archivadas), alta y edición. El código no cambia. |
| PATCH | `/sedes/:id/archivar` · `/sedes/:id/restaurar` | Admin | Nada se borra. 409 `SEDE_CON_BLOQUES` si aún tiene bloques activos. |
| GET · POST · PATCH | `/bloques` · `/bloques/:id` | Admin | Filtros `sedeId`, `activo`. Reducir `numeroPisos` es 422 si hay espacios en los pisos que sobran. |
| PATCH | `/bloques/:id/archivar` · `/bloques/:id/restaurar` | Admin | 409 `BLOQUE_CON_ESPACIOS`; restaurar exige la sede activa. |
| GET · POST · PATCH | `/tipos-espacio/gestion` · `/tipos-espacio` · `/tipos-espacio/:id` | Admin | Anticipación (RN-04), días hábiles y aforo que exige póliza. |
| PATCH | `/tipos-espacio/:id/archivar` · `/tipos-espacio/:id/restaurar` | Admin | 409 `TIPO_CON_ESPACIOS`. |
| GET · POST · PATCH | `/elementos` · `/elementos/:id` | Admin | Filtros `espacioId`, `estado`. Placa de inventario única (409 `PLACA_REGISTRADA`); `espacioId` en el PATCH lo traslada. |
| PATCH | `/elementos/:id/baja` | Admin | Estado `DADO_DE_BAJA`; no se borra. |
| GET | `/disponibilidad` | 🌐 | `espacioId`, `desde`, `hasta` → franjas con estado. Datos personales nunca. |
| GET | `/disponibilidad/sede` | 🌐 | Ocupación agregada de una sede o bloque en un rango. |
| GET | `/disponibilidad/buscar` | 🌐 | Búsqueda inversa: `fecha`, `horaInicio`, `horaFin`, `asistentes`, `sedeId`. |
| POST | `/bloqueos` | Admin, Responsable | Con RRULE opcional. 409 si choca con una franja. |
| PATCH | `/bloqueos/:id/anular` | Admin, Responsable | Libera las franjas del bloqueo. |
| POST | `/bloqueos/importar-horario` | Admin | CSV del horario académico → reporte de conflictos. |
| POST | `/tarifas/calcular` | 🌐 | Simulador. No persiste. |
| GET · POST · PATCH | `/tarifas` · `/tarifas/:id` | Admin | Una tarifa nueva cierra la anterior; el PATCH solo cierra la vigencia o edita el acuerdo (RN-05). |
| GET · PATCH | `/recargos` · `/recargos/:tipo` | Admin | `NOCTURNO`, `DOMINICAL`, `FESTIVO`. |
| GET · POST · DELETE | `/festivos` · `/festivos/:id` | Admin | `:id` es la fecha AAAA-MM-DD. Único borrado físico del tarifario. |
| GET | `/servicios` | 🌐 | Catálogo, filtrable por `tipoEspacioId`. |
| GET · POST · PATCH · DELETE | `/servicios/gestion` · `/servicios` · `/servicios/:id` | Admin | DELETE desactiva (`activo = false`); no borra. |
| GET · POST · PATCH · DELETE | `/proveedores` · `/proveedores/:id` | Admin | Desactivar un proveedor desactiva sus servicios. Contacto y porcentaje son privados. |
| POST | `/solicitudes` | Solicitante | Crea borrador. |
| GET | `/solicitudes` | Según rol | Propias / bandeja / todas. Filtros por estado. |
| GET | `/solicitudes/:id` | Según alcance | Detalle completo. |
| PATCH | `/solicitudes/:id` | Dueño (borrador) | Datos del evento. |
| POST/DELETE | `/solicitudes/:id/reservas` · `/solicitudes/:id/servicios` | Dueño (borrador) | Ítems. |
| GET · POST | `/solicitudes/:id/documentos` | Dueño, según alcance | Adjuntos. |
| GET · DELETE | `/solicitudes/:id/documentos/:documentoId[/archivo]` | Según alcance | Descarga o retira un adjunto. |
| POST | `/solicitudes/:id/enviar` | Dueño | UC-01. |
| POST | `/solicitudes/:id/decisiones` | Responsable, Aprobador | UC-02. |
| POST | `/solicitudes/:id/cancelar` | Dueño, Admin | RN-14. |
| GET | `/solicitudes/:id/cotizacion.pdf` | Según alcance | PDF tamaño carta. |
| POST | `/pagos/ordenes` | Dueño | UC-03. 422 si exenta. |
| POST | `/pagos/ordenes/:id/soporte` | Dueño | Comprobante. |
| POST | `/pagos/ordenes/:id/verificacion` | Tesorería | Aprueba o rechaza. |
| POST | `/pagos/ordenes/:id/pago-tardio` | Tesorería | RN-02d: confirma una solicitud vencida si las franjas siguen libres. |
| GET | `/pagos/ordenes/:id/soporte` | Según alcance | Descarga el comprobante. |
| GET | `/pagos/ordenes` | Tesorería, Auditor | Conciliación. |
| POST | `/pagos/webhook/:proveedor` | 🌐 (firma) | Fase posterior. |
| POST | `/actas` | Responsable | Entrega o devolución. |
| GET | `/actas/:id` · `/actas/:id.pdf` | Según alcance | Detalle y PDF. |
| GET | `/notificaciones` · PATCH `/notificaciones/:id/leida` | Autenticado | |
| GET | `/reportes/tablero` | Admin, Aprobador, Tesorería, Auditor | Indicadores RF-REP-01. |
| GET | `/reportes/:tipo.xlsx` · `/reportes/:tipo.csv` | Según rol | Exportaciones. |
| GET | `/auditoria` | Admin, Auditor | Bitácora filtrable. |
| GET · PATCH · PUT | `/usuarios` · `/usuarios/:id/estado` · `/usuarios/:id/roles` | Admin | Los usuarios no se borran: se activan o desactivan. |
| GET · POST · PATCH | `/dependencias` · `/dependencias/:id` · `/dependencias/:id/archivar` · `/dependencias/:id/restaurar` | Admin | 409 si tiene espacios activos. |
| GET · PATCH | `/parametros` · `/parametros/:clave` | Admin | Plazos, cuenta de recaudo y reglas leídas por los servicios. |

## 6. Errores

Todas las respuestas de error tienen la misma forma:

```json
{
  "codigo": "FRANJA_NO_DISPONIBLE",
  "mensaje": "El Auditorio Mayor ya está ocupado el 12/11/2026 de 14:00 a 16:00.",
  "detalles": { "conflictos": [ ... ], "sugerencias": [ ... ] },
  "correlacionId": "b3e1..."
}
```

- `mensaje` está escrito para el usuario final, en español (sección 10.4 del documento base).
- Los servicios lanzan `ErrorDominio(codigo, mensaje, status, detalles)`; el filtro global lo traduce. Nunca se filtra un stack trace al cliente.
- Códigos HTTP: `400` validación, `401` sin sesión, `403` sin rol, `404` no existe o no es tuyo, `409` conflicto de estado o franja, `422` regla de negocio, `429` límite de peticiones.

## 7. Trabajos en segundo plano (BullMQ)

| Cola | Qué hace | Cuándo |
|---|---|---|
| `vencimientos` | Libera solicitudes y órdenes vencidas (RN-02). | Cada 5 min. |
| `recordatorios` | Recordatorio y escalamiento al aprobador; recordatorio 48 h y 24 h antes del evento. | Cada 15 min. |
| `correos` | Envío con reintentos exponenciales. | Al encolar. |
| `pdf` | Cotizaciones y actas. | Al encolar. |
| `webhooks` | Procesa eventos de pasarela. Fase posterior. | Al recibir. |
| `conciliacion` | Consulta activa de pagos pendientes > 30 min. Fase posterior. | Cada 10 min. |

> ⚠️ Si a algún integrante se le complica Redis en su máquina, los dos primeros pueden correr con `@nestjs/schedule` (cron en proceso) durante el avance de 20 días; el correo se envía directo. El código de los casos de uso no cambia.

## 8. Transversales

- **Validación:** `ValidationPipe` global con `whitelist` y `forbidNonWhitelisted`. Todo DTO con `class-validator`.
- **Límite de peticiones:** `@nestjs/throttler`: 100/min por IP en general; 5/min en `/auth/ingresar` y `/auth/reenviar-codigo`.
- **Seguridad:** Helmet, CORS solo al dominio del frontend, cookies `secure`, tamaño máximo de cuerpo, subida de archivos validando tipo por contenido.
- **Bitácora:** interceptor que registra automáticamente los métodos marcados con `@Auditar('accion', 'entidad')`, con antes y después.
- **Logs:** JSON con `correlacionId` por petición (cabecera `x-correlation-id`), RNF-15.
- **Zona horaria:** `TZ=UTC` en el proceso; conversión a `America/Bogota` solo al formatear.
- **Correo:** `CorreoPort` con adaptador SMTP. En desarrollo, Mailpit (`http://localhost:8025`) captura todo.
- **Archivos:** `AlmacenamientoPort` con adaptador S3 (MinIO en desarrollo).
