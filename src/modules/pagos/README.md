# pagos

órdenes, consignación, puerto de pasarela, webhooks

Estado: UC-03 por consignación y Web Checkout Wompi sandbox implementados; verificación pendiente del orquestador.

- `POST /api/pagos/ordenes` (dueño): orden `OP-` por total de la cotización más depósito, con la cuenta de `cuenta_recaudo`; la solicitud pasa a `PAGO_PENDIENTE`. Devuelve la orden pendiente si ya existe; `422 SOLICITUD_EXENTA` (RN-08), `409 ORDEN_NO_PERMITIDA` o `COTIZACION_VENCIDA`.
- `POST /api/pagos/ordenes/:id/soporte` (dueño): comprobante PDF/PNG/JPG de hasta 10 MB validado por contenido; la orden queda `EN_VERIFICACION` (no vence).
- `POST /api/pagos/ordenes/:id/verificacion` (TESORERIA): aprobar confirma la orden, la solicitud (RN-11) y las franjas; rechazar exige observación y deja la solicitud en `PAGO_PENDIENTE` para generar otra orden.
- `GET /api/pagos/ordenes` (TESORERIA, AUDITOR): conciliación paginada con filtro por estado; `GET /api/pagos/ordenes/:id/soporte`: su dueño, tesorería y auditoría.
- Todo escribe bitácora (`ORDEN_PAGO_CREADA`, `SOPORTE_PAGO_CARGADO`, `PAGO_APROBADO`, `PAGO_RECHAZADO`).

`puertos/pasarela.port.ts` tiene adaptadores Wompi sandbox y ninguna pasarela; ver el contrato más abajo.

Deuda técnica por confirmar con Jensen: este módulo lee y actualiza solicitud, cotización y franjas con Prisma directamente; la regla del plan es usar servicios exportados de `reservas` y `disponibilidad`.

Pendiente fuera de esta entrega: reembolso por API, factura electrónica, anticipo/saldo y orden de servicio para entidades públicas.

- `POST /api/pagos/ordenes/:id/pago-tardio` (TESORERIA, RN-02d): pago recibido tras vencer la orden. Si las franjas siguen libres se vuelven a ocupar y la solicitud pasa de `VENCIDA` a `CONFIRMADA`; si ya no, la orden queda aprobada, se crea un `Reembolso` por el valor total y se avisa a tesorería y al solicitante. `409 PAGO_TARDIO_NO_APLICA` si la orden o la solicitud no están vencidas.

## Wompi sandbox

Activar con `PASARELA_PROVEEDOR=wompi` y las cuatro credenciales de sandbox en el entorno. La opción predeterminada `ninguna` conserva el flujo de consignación y rechaza iniciar checkout con 503. Las llaves deben ser `pub_test_...` y `prv_test_...`; solo se permite `https://sandbox.wompi.co/v1`. No se agregaron dependencias ni migraciones.

La configuración validada conserva estas variables del archivo `.env` y exige las cuatro credenciales solo cuando se activa Wompi. Los plazos configurables admiten enteros de 1 a 1440 minutos.

### Contrato HTTP

Todas las rutas llevan el prefijo global `/api`.

| Método y ruta | Autorización y cuerpo | Respuesta |
| --- | --- | --- |
| `POST /pagos/ordenes/:id/pasarela` | Bearer, solicitante dueño; sin cuerpo. UUID de una orden previamente creada. El servidor genera el retorno `{FRONTEND_URL}/pagos/retorno?orden=<id>`. | 201 `{ "ordenPagoId": "uuid", "urlCheckout": "https://checkout.wompi.co/p/?...", "transaccionExternaId": null }`. El ID externo será string si ya se recibió un evento de la transacción pendiente. |
| `POST /pagos/webhooks/wompi` | Público; JSON original del evento Wompi `transaction.updated`, ambiente `test`, con `data.transaction`, `signature.properties`, `signature.checksum` y `timestamp`; opcional cabecera `X-Event-Checksum`. Se verifica el cuerpo crudo capturado por Nest. | 200 `{ "recibido": true, "duplicado": false }`; un reintento devuelve `duplicado: true`. La recepción no significa pago aprobado: el procesamiento es asíncrono. |
| `GET /pagos/ordenes/:id/estado` | Bearer, solicitante dueño; sin cuerpo. No acepta estado ni ID de Wompi enviados por el navegador. | 200 `{ "estado": "PENDIENTE", "referencia": "OP-2026-000001", "valor": 350000 }`. Valor en pesos enteros. |

Errores con el formato común `{ codigo, mensaje, detalles?, correlacionId }`: 400 datos/UUID/cuerpo inválidos; 401 sin sesión o `FIRMA_WEBHOOK_INVALIDA`; 404 `NO_ENCONTRADO` para orden ajena; 409 `ORDEN_NO_PERMITIDA` (pagada, vencida, con soporte o solicitud fuera de PAGO_PENDIENTE); 422 `SOLICITUD_EXENTA` o `EVENTO_INVALIDO`; 503 `PASARELA_DESACTIVADA`/`PASARELA_SIN_CONFIGURAR`. Las solicitudes exentas no reciben datos de checkout ni de estado de pago.

### Decisiones de integración

- Web Checkout no crea una transacción mediante POST: genera un enlace firmado con referencia, centavos y moneda. El ID de Wompi existe después de abrir/pagar; por ello el retorno `crearTransaccion().transaccionExternaId` del puerto se amplió a `string | null`, sin inventar IDs externos. Se conserva la referencia OP única y no se crean referencias adicionales al reabrir checkout.
- Pesos enteros en SIRA y centavos exclusivamente en WompiAdapter. La firma de integridad es SHA256(referencia + centavos + COP + secreto). El enlace solo contiene llave pública y hash, nunca secretos.
- La firma de eventos concatena las propiedades dinámicas de `data` en el orden recibido, timestamp y secreto de eventos; compara 32 bytes en tiempo constante. Exige incluir ID, estado y monto para impedir retirar propiedades críticas de la firma.
- Wompi no tiene un ID de evento independiente en este esquema. Se deriva `idEventoExterno` con SHA256(ID de transacción + estado + timestamp + valor), y la restricción `(proveedor, idEventoExterno)` del modelo existente asegura idempotencia. El cuerpo crudo se conserva sin reformatearlo en `EventoPasarela.cuerpo.crudo`.
- La petición del webhook valida y persiste; no consulta servicios externos ni envía correos. ScheduleModule, ya configurado, consume la cola durable de EventoPasarela cada 10 segundos. Los errores temporales conservan `procesadoEn = null`; los errores de negocio quedan guardados con código y fecha, disponibles para revisión/reproceso. El cursor rotativo evita que un lote fallido bloquee los eventos posteriores.
- Antes de aplicar, se consulta por ID a la API autenticada de Wompi. La referencia del webhook no siempre está firmada: se usa la obtenida por API. Se compara el monto firmado con el consultado y luego con la orden; también se verifican COP, exención y vinculación del ID externo. Los eventos fuera de orden no degradan pagos resueltos. La actualización de solicitud, orden, franjas, historial, bitácora y notificación interna es atómica; no se generan correos que puedan duplicarse.
- La página de retorno solo lee. Consulta activa cada 10 minutos para órdenes PENDIENTE con ID externo conocido y última actualización anterior a `PASARELA_CONSULTA_MINUTOS` (30 por defecto). Sin un primer evento de Wompi todavía no existe ID consultable: el retorno del navegador no lo incorpora ni confirma pagos. Los eventos persistidos se reintentan incluso si la orden venció.
- La primera apertura extiende una sola vez los plazos de orden, solicitud y franjas retenidas hasta al menos `PASARELA_GRACIA_MINUTOS` (120 por defecto); reabrir checkout no prolonga indefinidamente la reserva. El flujo de soporte rechaza órdenes de pasarela, también en su guarda transaccional.
- Un pago aprobado tardío intenta recuperar franjas libres con la máquina de estados. La exclusión SQL y un savepoint resuelven carreras: si no se recuperan, se registra el pago recibido y un reembolso total solicitado, avisando internamente a tesorería y solicitante.
- `reembolsar` lanza 501 `REEMBOLSO_NO_SOPORTADO`: este adaptador no implementa el reembolso por API sandbox. La gestión manual existente de tesorería permanece disponible.

Fuentes oficiales consultadas: [Web Checkout](https://docs.wompi.co/docs/colombia/widget-checkout-web/) y [eventos y firma](https://docs.wompi.co/docs/colombia/eventos/).

### Entrega y verificación

Se añadieron pruebas Vitest de firma de integridad, firmas válidas/inválidas/manipuladas, properties dinámicas, consulta y reembolso; además exención, autorización por recurso, retorno de solo lectura, idempotencia, montos distintos, conciliación y pagos tardíos. También se reconstruyó el adaptador de disco con pruebas de bytes, ausencia, eliminación y traversal Windows/Linux. Por instrucción del coordinador no se ejecutaron build, tests, lint ni migraciones: **no verificado**. Integración HTTP real con Wompi, latencia del webhook, transacciones PostgreSQL/savepoints, carreras entre procesos y flujo real de checkout: **no verificado**; requieren revisión y ejecución del orquestador con sus credenciales sandbox.
