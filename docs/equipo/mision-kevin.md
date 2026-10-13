# SIRA · Misión del agente de Kevin Guerrero

> Pega este archivo completo como contexto inicial de tu agente de programación, junto con `PROMPT-MAESTRO.md`.
> Cubre los 20 días (13 oct. – 1 nov. 2026). Precisa el reparto de `docs/architecture/08-plan-de-trabajo-20-dias.md`; donde este documento sea más específico que `08`, manda este.
> Documento hermano: `docs/equipo/mision-isabel.md`. Los dos están escritos para que Kevin e Isabel **nunca editen el mismo archivo**.

## 1. Tu papel

Eres el dueño de la **lógica de reservas**: qué está ocupado, cómo se pide un espacio y qué pasa con la solicitud en el tiempo.

| Semana | Resultado |
|---|---|
| 1 (13–18 oct.) | Disponibilidad: franjas, bloqueos con recurrencia, `GET /disponibilidad`, componente de calendario y búsqueda inversa. |
| 2 (19–25 oct.) | Solicitudes en el backend: borrador, ítems, máquina de estados, envío con retención (UC-01), exención, documentos y cancelación. |
| 3 (26 oct.–1 nov.) | Vencimientos y recordatorios (jobs), correos y centro de notificaciones, pruebas de punta a punta. |

## 2. Antes de empezar

1. Lee `PROMPT-MAESTRO.md`, `docs/architecture/01` a `04` (sobre todo `02` §3.4 y §4, y `03` §3 y §4) y el módulo `src/modules/inventario` del backend: es el ejemplo de cómo se escribe todo.
2. Requisitos: Node.js 22.22.3 o superior, Docker Desktop, Git, puerto 5432 libre.
3. Arranque (una vez por repo):

   ```bash
   # Backend
   npm install && cp .env.example .env
   npm run db:up && npm run db:migrate && npm run db:seed
   npm run dev                      # http://localhost:3001/docs

   # Frontend
   npm install && cp .env.example .env.local
   npm run start                    # http://localhost:3000
   ```
4. Tu rama en **los dos repos** es `feature/kevin`. Nunca trabajas en `main`, `develop` ni en la rama de otra persona.

## 3. Tu territorio (solo tú editas estos archivos)

### Backend (`Sistema-Sira-Backend`)

| Ruta | Qué va ahí |
|---|---|
| `src/modules/disponibilidad/**` | Franjas, bloqueos, calendario, búsqueda inversa. Es el **único** módulo que lee y escribe `franja_ocupada` y `bloqueo_calendario`. |
| `src/modules/reservas/**` | Solicitudes, ítems, documentos, máquina de estados (`dominio/maquina-estados.ts` ya existe y no se reescribe). Excepción: `src/modules/reservas/cotizacion/**` es de Jensen. |
| `src/modules/notificaciones/**` | Plantillas de correo, notificaciones en la app, jobs de vencimientos y recordatorios. |

### Frontend (`Sistema-Sira-Frontend`)

| Ruta | Qué va ahí |
|---|---|
| `src/components/CalendarioEspacio.tsx` y `src/components/calendario/**` | Calendario con estados, patrones y etiquetas. |
| `src/components/CentroNotificaciones.tsx` | Centro de notificaciones (lo monta Jensen en el layout del panel). |
| `src/app/(publico)/buscar/**` | Búsqueda inversa. |
| `src/app/(panel)/panel/calendario/**` | Bloqueos manuales y recurrentes. |
| `src/lib/disponibilidad.ts`, `src/lib/solicitudes.ts`, `src/lib/notificaciones.ts`, `src/lib/tipos-disponibilidad.ts`, `src/lib/tipos-solicitudes.ts`, `src/lib/tipos-notificaciones.ts` | Llamadas y tipos de tus módulos. **El dueño del módulo de backend es dueño de sus tipos en el frontend.** |

## 4. Lo que NO tocas

| Archivo o carpeta | Dueño | Si necesitas un cambio |
|---|---|---|
| `src/modules/inventario/**`, `src/modules/servicios/**`, `src/modules/actas/**`, `src/modules/reportes/**`, `src/shared/almacenamiento/**` (backend) | Isabel | Pídeselo; ella lo hace en su rama. |
| `src/app/(publico)/page.tsx`, `(publico)/sedes/**`, `(publico)/espacios/**`, `(publico)/servicios/**`, `(cuenta)/solicitar/**`, `(cuenta)/mis-solicitudes/**`, `panel/page.tsx`, `panel/inventario/**`, `panel/servicios/**`, `panel/actas/**`, `globals.css`, y los componentes `TarjetaEspacio`, `TarjetaBloque`, `IndicadorAforo`, `EstadoVacio`, `EstadoError`, `Foto`, `Esqueleto`, `CargadorArchivos`, `InsigniaEstado`, `LineaTiempoSolicitud`, `ResumenCotizacion`, `DialogoConfirmacion`, encabezado y pie (frontend) | Isabel | Igual. Tú solo los **importas**. |
| `src/modules/identidad`, `tarifario`, `aprobaciones`, `pagos`, `auditoria`, `reservas/cotizacion`; `src/shared/**`; `src/main.ts` | Jensen | Pídeselo. |
| `src/app/(auth)/**`, `src/app/(panel)/layout.tsx`, `panel/aprobaciones`, `panel/pagos`, `panel/tarifario`, `panel/auditoria`, `panel/configuracion`, `(publico)/simulador`, `src/lib/api.ts`, `src/lib/formato.ts` | Jensen | Pídeselo. |
| `prisma/schema.prisma`, `prisma/sql/restricciones.sql`, `prisma/migrations/**` | Jensen aprueba | Para y explica por qué antes de tocar nada. Solo una persona a la vez cambia el esquema. |
| `docs/**`, `PROMPT-MAESTRO.md` | Jensen | Se cambian primero en Backend y se copian a Frontend. |

**Sobre "Mis solicitudes":** la tabla de `08` §1 te la asigna en la semana 3 y el día a día se la da a Isabel. Queda así: **tú haces el backend** (`GET /solicitudes`, `GET /solicitudes/:id` con historial) e **Isabel hace las pantallas**.

### Archivos compartidos: cómo se tocan sin chocar

| Archivo | Regla |
|---|---|
| `src/app.module.ts` | Solo agregas la línea `import` de tu módulo y su entrada en `imports`, en orden alfabético. Nada más en ese PR. |
| `prisma/seed.ts` | Un cambio a la vez. Avisa en el grupo, hazlo en un PR que solo toque el seed y fusiónalo el mismo día. Los espacios reales los cargas tú el domingo 18, con los datos de inventario acordados con Isabel. |
| `package.json` / `package-lock.json` | Dependencia nueva (`rrule`, por ejemplo): avisa para qué y qué alternativa descartaste, en un PR aparte y pequeño. |
| `.env.example` + `src/shared/config/configuracion.ts` | Variable nueva: la pides a Jensen (él edita `shared/config`). |

## 5. Contratos con Isabel

Un contrato es lo único que cruza entre los dos territorios. Se publica **primero como tipos o firma** (aunque la implementación sea un marcador), para que el otro no espere.

### Lo que tú le entregas a Isabel

| # | Qué | Para cuándo |
|---|---|---|
| K1 | Componente `CalendarioEspacio` con props `{ codigoEspacio, modo: 'lectura' \| 'seleccion', fechaInicial?, onSeleccion?(franja: { inicio, fin }) }`. | Jue 15 (marcador con las props) · Vie 16 (funcional) |
| K2 | `src/lib/tipos-solicitudes.ts` y `src/lib/solicitudes.ts`: tipos y llamadas de `POST /solicitudes`, `PATCH /solicitudes/:id`, ítems de reserva y servicio, documentos, `enviar`, `GET /solicitudes` y `GET /solicitudes/:id` (con historial de estados). | Lun 19 en la mañana (tipos) · según tu día a día (endpoints) |
| K3 | `SolicitudesService.transicionar(tx, solicitudId, evento, usuarioId, observacion?)`, exportado por `ReservasModule`: valida con `validarTransicion`, escribe historial y bitácora y actualiza las franjas en la misma transacción. Lo usan las actas de Isabel y las decisiones y pagos de Jensen. | Mar 20 (firma, con la máquina de estados) · antes del Lun 26 (probado) |
| K4 | Error `409 FRANJA_NO_DISPONIBLE` con `detalles.conflictos` y `detalles.sugerencias`. | Mié 21 |

### Lo que Isabel te entrega a ti

| # | Qué | Para cuándo |
|---|---|---|
| I1 | `InventarioConsultaService`, exportado por `InventarioModule`: `obtenerEspacioParaReserva(codigo)` (capacidad, montaje y desmontaje, estado, tipo con anticipación y aforo de póliza, horarios, responsable, dependencia, depósito) y `listarReservablesPorCapacidad({ sede?, asistentes })`. | Mié 14 (firma) · Jue 15 (implementado) |
| I2 | `AlmacenamientoPort` en `src/shared/almacenamiento/`: `subir({ clave, contenido, tipoMime }) → { url }` y `eliminar(clave)`, con el token `ALMACENAMIENTO`. Lo usas para los documentos adjuntos. | Dom 18 |
| I3 | `ServiciosConsultaService.obtenerParaItem(id)`, exportado por `ServiciosModule`, para validar los ítems de servicio. | Lun 19 |
| I4 | Componentes `TarjetaEspacio`, `IndicadorAforo`, `EstadoVacio`, `EstadoError`, `CargadorArchivos` para tus pantallas. | Ya existen · `CargadorArchivos` Dom 18 |

### Lo que necesitas de Jensen

| Qué | Para cuándo |
|---|---|
| `@UsuarioActual()` con sesión real y `RolesGuard` con alcance por dependencia. | Vie 16 |
| `TarifarioService.calcular()` para el valor estimado al enviar. | Lun 19 |
| `CorreoPort` (adaptador SMTP a Mailpit) para tus plantillas. | Jue 15 (lo crea para la verificación de correo) |
| `@Auditar` (interceptor de bitácora). | Dom 18 |

**Si un contrato no llegó el día previsto:** no entres al territorio del otro. Trabaja contra la firma publicada con un doble de prueba y avisa en el daily.

## 6. Tareas en orden

Cada tarea es un PR pequeño hacia `develop`. Marca cada una cuando cumpla el "Terminado" de la sección 8.

### Semana 1 · Disponibilidad

| Día | Tarea | Se acepta cuando |
|---|---|---|
| Mié 14 | `DisponibilidadService.consultar(espacioId, desde, hasta)` sobre `franja_ocupada` y `GET /disponibilidad` público. | Filtra con `espacio_id = $1 AND periodo && tstzrange($2, $3)`; el público solo ve "Ocupado" o `etiquetaPublica`, nunca datos personales. |
| Jue 15 | `POST /bloqueos` con RRULE (librería `rrule`) que expande a franjas `BLOQUEO`. Publica el marcador de K1. | Un bloqueo que choca responde `409 FRANJA_NO_DISPONIBLE`; anular libera sus franjas (`LIBERADA`), no las borra. |
| Vie 16 | `CalendarioEspacio` funcional: mes, semana y día, estados con color, patrón y etiqueta. | El estado nunca se comunica solo con color; en celular pasa a lista por día; se usa con teclado. |
| Sáb 17 | `GET /disponibilidad/buscar` (fecha, hora, asistentes, sede) y página `/buscar`. | Usa I1 para la capacidad, oculta los que no caben y ordena con `ordenarPorAjuste`. |
| Dom 18 | Cargar en el seed los espacios reales si ya llegaron los planos. | Sigue siendo idempotente; los datos de ejemplo conservan la marca "(dato de ejemplo)". |

**Hito:** el calendario de un espacio muestra una clase bloqueada, y la búsqueda "40 personas, viernes de 2 a 6" sugiere un aula y no el auditorio.

### Semana 2 · Solicitudes

| Día | Tarea | Se acepta cuando |
|---|---|---|
| Lun 19 | Publica K2 (tipos) a primera hora. `POST /solicitudes` (borrador), `PATCH`, ítems de reserva y de servicio. | Solo el dueño ve y edita su borrador; un id ajeno responde `404`. Nada se retiene en borrador. |
| Mar 20 | Servicio de la máquina de estados sobre `validarTransicion` + firma de K3. | Prueba de la tabla de transiciones completa; ningún código cambia `solicitud.estado` por fuera. |
| Mié 21 | **UC-01** `POST /solicitudes/:id/enviar`: validaciones (RN-04, RN-18, RN-19, RN-20), transacción con consecutivo `SOL-`, franjas `RETENIDA` con montaje y desmontaje, `venceEn` desde `Parametro`, manejo de `23P01` (K4). | Dos envíos sobre la misma franja: el segundo recibe `409` con conflictos y sugerencias. |
| Jue 22 | Evaluación de RN-07 (exención) en el envío. Prueba de carrera de RNF-05 contra PostgreSQL real. | El cliente nunca envía `esExenta`; de dos transacciones simultáneas, exactamente una confirma. |
| Vie 23 | Carga de documentos adjuntos con I2, validando tipo por contenido y tamaño. | La póliza es obligatoria si el aforo supera `aforoExigePoliza`. |
| Sáb 24 | Cancelación por el solicitante (libera franjas; el reembolso queda para la etapa 2). | Pasa por K3 y exige motivo. |
| Dom 25 | Corrección de bugs de la demo del jueves. | |

**Hito:** el recorrido del docente (exento) funciona completo y una empresa puede enviar su solicitud.

### Semana 3 · Jobs, correos y pruebas

| Día | Tarea | Se acepta cuando |
|---|---|---|
| Lun 26 | Job de vencimientos (revisión y pago) que libera franjas. K3 probado y estable para las actas. | Los plazos se leen de `Parametro`, nunca de constantes; una orden en verificación no vence. |
| Mar 27 | Job de recordatorios: aprobador a las 24 h y 48 h, evento 48 h y 24 h antes. | Ningún recordatorio se envía dos veces. |
| Mié 28 | Plantillas de correo para cada cambio de estado + `CentroNotificaciones` y `GET /notificaciones`. | Los correos se ven en Mailpit (`http://localhost:8025`). |
| Vie 30 | Pruebas de punta a punta de UC-01 a UC-03. | Corren contra PostgreSQL real. |
| Sáb 31 | Corrección de bugs. | |
| Dom 1 | Congelamiento y ensayo de la demo. Nada nuevo después del mediodía. | |

Si el tiempo no alcanza, lo primero que se recorta son los recordatorios automáticos (`08` §5). **Nunca** se recorta la restricción de no solapamiento ni la máquina de estados.

## 7. Flujo de trabajo diario

```bash
git switch feature/kevin
git fetch origin && git merge origin/develop     # cada mañana, antes de escribir código
# ... trabajas una tarea ...
git add -A && git commit -m "feat: búsqueda inversa por aforo"
git push
```

1. Abre un pull request de `feature/kevin` hacia `develop` al terminar cada tarea (máximo dos días de vida).
2. Lo aprueba otra persona. Jensen revisa todo lo que toque `shared/`, `app.module.ts` o el esquema.
3. Después de fusionar, vuelve a traer `develop` a tu rama.
4. Commits en español con Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`).
5. Si una tarea toca los dos repos, son dos PR con el mismo título.

## 8. Terminado

- `npm run build`, `npm run test` y `npm run lint` pasan en el repo que tocaste.
- Endpoint con DTO validado y visible en Swagger, con sus respuestas de error.
- Regla de negocio nueva con su prueba unitaria; las de concurrencia, contra PostgreSQL real.
- Pantalla con sus cinco estados (cargando, vacío, datos, error, sin permiso), funciona en 360 px y se usa con teclado.
- Ningún archivo fuera de tu territorio aparece en el PR, salvo los "compartidos" con su regla.

## 9. Reglas que tu agente no rompe

- La disponibilidad **nunca** se valida solo en código: la garantiza `sin_solapamiento` y tú traduces el error `23P01`.
- Toda transición pasa por la máquina de estados, escribe historial y bitácora y actualiza las franjas en la **misma transacción**.
- Consecutivos desde `ConsecutivoService`, nunca de `count()`. Plazos desde `Parametro`.
- Nada de autenticación, tarifas, aprobaciones, pagos, inventario ni actas: no son tuyos. Usas sus servicios exportados.
- Ningún dato personal en endpoints públicos. Dinero en pesos enteros. Fechas en UTC; `America/Bogota` solo al mostrar.
- Migraciones: `npm run db:nueva-migracion -- --name <descripcion>`, borrando a mano la sentencia `ALTER COLUMN periodo DROP DEFAULT`, y solo con el visto bueno de Jensen.
- Si dos documentos se contradicen o necesitas salir de tu territorio: **para y pregunta a Jensen**.
