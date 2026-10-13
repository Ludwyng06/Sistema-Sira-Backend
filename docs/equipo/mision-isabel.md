# SIRA · Misión del agente de Isabel Cerón

> Pega este archivo completo como contexto inicial de tu agente de programación, junto con `PROMPT-MAESTRO.md`.
> Cubre los 20 días (13 oct. – 1 nov. 2026). Precisa el reparto de `docs/architecture/08-plan-de-trabajo-20-dias.md`; donde este documento sea más específico que `08`, manda este.
> Documento hermano: `docs/equipo/mision-kevin.md`. Los dos están escritos para que Isabel y Kevin **nunca editen el mismo archivo**.

## 1. Tu papel

Eres la dueña de la **experiencia visual** y del **inventario**. Haces de punta a punta (backend y frontend):

| Semana | Resultado |
|---|---|
| 1 (13–18 oct.) | Inventario completo de administración, portal público por bloques, ficha del espacio y carga de fotos. |
| 2 (19–25 oct.) | Asistente de solicitud de 6 pasos (solo frontend), "Mis solicitudes" y detalle con línea de tiempo (solo frontend). |
| 3 (26 oct.–1 nov.) | Actas de entrega y devolución, tablero de indicadores, pasada de accesibilidad y pulido visual. |

## 2. Antes de empezar

1. Lee `PROMPT-MAESTRO.md`, `docs/architecture/01` a `04` y el módulo `src/modules/inventario` del backend: es el ejemplo de cómo se escribe todo.
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
4. Tu rama en **los dos repos** es `feature/isabel`. Nunca trabajas en `main`, `develop` ni en la rama de otra persona.

## 3. Tu territorio (solo tú editas estos archivos)

### Backend (`Sistema-Sira-Backend`)

| Ruta | Qué va ahí |
|---|---|
| `src/modules/inventario/**` | Todo el inventario: público (ya existe) y administración. |
| `src/modules/servicios/**` | Catálogo de servicios complementarios y proveedores. `08` no lo asignaba; queda contigo porque lo consume tu asistente. |
| `src/modules/actas/**` | Actas de entrega y devolución, novedades. |
| `src/modules/reportes/**` | Tablero de indicadores y exportaciones. |
| `src/shared/almacenamiento/**` | `AlmacenamientoPort` y su adaptador S3. Es la única carpeta de `shared/` que creas tú, porque eres la primera en necesitarla. Kevin la usa después. |

### Frontend (`Sistema-Sira-Frontend`)

| Ruta | Qué va ahí |
|---|---|
| `src/app/(publico)/page.tsx`, `(publico)/sedes/**`, `(publico)/espacios/**`, `(publico)/servicios/**` | Portal público. |
| `src/app/(cuenta)/solicitar/**` | Asistente de solicitud (6 pasos). |
| `src/app/(cuenta)/mis-solicitudes/**` | Lista y detalle con línea de tiempo. |
| `src/app/(panel)/panel/page.tsx` | Tablero. |
| `src/app/(panel)/panel/inventario/**`, `panel/servicios/**`, `panel/actas/**` | Administración de inventario y servicios, actas. |
| `src/app/globals.css` | Tokens e identidad visual. |
| `src/components/` → `EncabezadoInstitucional`, `PieInstitucional`, `MarcoInstitucional`, `TarjetaBloque`, `TarjetaEspacio`, `IndicadorAforo`, `Foto`, `Esqueleto`, `EstadoVacio`, `EstadoError`, `EnConstruccion`, y los nuevos `CargadorArchivos`, `DialogoConfirmacion`, `InsigniaEstado`, `LineaTiempoSolicitud`, `ResumenCotizacion` | Componentes visuales compartidos: tú los creas y los mantienes; los demás solo los importan. |
| `src/lib/inventario.ts`, `src/lib/tipos.ts`, y los nuevos `src/lib/servicios.ts`, `src/lib/actas.ts`, `src/lib/reportes.ts`, `src/lib/tipos-servicios.ts`, `src/lib/tipos-actas.ts`, `src/lib/tipos-reportes.ts` | Llamadas y tipos de tus módulos. |

## 4. Lo que NO tocas

| Archivo o carpeta | Dueño | Si necesitas un cambio |
|---|---|---|
| `src/modules/disponibilidad/**`, `src/modules/reservas/**`, `src/modules/notificaciones/**` (backend) | Kevin | Pídeselo; él lo hace en su rama. |
| `src/components/CalendarioEspacio.tsx`, `src/components/calendario/**`, `src/app/(publico)/buscar/**`, `src/app/(panel)/panel/calendario/**`, `src/lib/disponibilidad.ts`, `src/lib/solicitudes.ts`, `src/lib/tipos-disponibilidad.ts`, `src/lib/tipos-solicitudes.ts` (frontend) | Kevin | Igual. Tú solo los **importas**. |
| `src/modules/identidad`, `tarifario`, `aprobaciones`, `pagos`, `auditoria`; `src/shared/**` (salvo `almacenamiento`); `src/main.ts` | Jensen | Pídeselo. |
| `src/app/(auth)/**`, `src/app/(panel)/layout.tsx`, `panel/aprobaciones`, `panel/pagos`, `panel/tarifario`, `panel/auditoria`, `panel/configuracion`, `(publico)/simulador`, `src/lib/api.ts`, `src/lib/formato.ts` | Jensen | Pídeselo. |
| `prisma/schema.prisma`, `prisma/sql/restricciones.sql`, `prisma/migrations/**` | Jensen aprueba | Para y explica por qué antes de tocar nada. Solo una persona a la vez cambia el esquema. |
| `docs/**`, `PROMPT-MAESTRO.md` | Jensen | Se cambian primero en Backend y se copian a Frontend. |

### Archivos compartidos: cómo se tocan sin chocar

| Archivo | Regla |
|---|---|
| `src/app.module.ts` | Solo agregas la línea `import` de tu módulo y su entrada en `imports`, en orden alfabético. Nada más en ese PR. |
| `prisma/seed.ts` | Un cambio a la vez. Avisa en el grupo, hazlo en un PR que solo toque el seed y fusiónalo el mismo día. Los espacios reales los carga Kevin el domingo 18 (plan `08`): coordina con él los datos de inventario. |
| `package.json` / `package-lock.json` | Dependencia nueva: avisa para qué y qué alternativa descartaste, en un PR aparte y pequeño. |
| `.env.example` + `src/shared/config/configuracion.ts` | Variable nueva: la pides a Jensen (él edita `shared/config`). |

## 5. Contratos con Kevin

Un contrato es lo único que cruza entre los dos territorios. Se publica **primero como tipos o firma** (aunque la implementación sea un marcador), para que el otro no espere.

### Lo que tú le entregas a Kevin

| # | Qué | Para cuándo |
|---|---|---|
| I1 | `InventarioConsultaService`, exportado por `InventarioModule`: `obtenerEspacioParaReserva(codigo)` devuelve `id, codigo, nombre, capacidadPersonas, minutosMontaje, minutosDesmontaje, estado, esReservable, archivadoEn, requiereAval, responsableId, dependenciaId, depositoValorFijo, depositoPorcentaje, tipo { codigo, anticipacionMinimaDias, anticipacionEnHabiles, aforoExigePoliza }, horarios[]`. Y `listarReservablesPorCapacidad({ sede?, asistentes })` para la búsqueda inversa. Uso interno: aquí sí va `responsableId`; nunca sale por un endpoint público. | Mié 14 (firma) · Jue 15 (implementado) |
| I2 | `AlmacenamientoPort` en `src/shared/almacenamiento/`: `subir({ clave, contenido, tipoMime }) → { url }` y `eliminar(clave)`, con el token de inyección `ALMACENAMIENTO`. | Dom 18 |
| I3 | `ServiciosConsultaService`, exportado por `ServiciosModule`: `obtenerParaItem(id)` (servicio, unidad de cobro, anticipación, cantidad máxima, tipos permitidos) y `GET /servicios?tipoEspacio=`. | Lun 19 |
| I4 | Componentes `TarjetaEspacio`, `IndicadorAforo`, `EstadoVacio`, `EstadoError`, `CargadorArchivos` con props estables. Si cambias una prop, avisas antes. | Ya existen · `CargadorArchivos` Dom 18 |

### Lo que Kevin te entrega a ti

| # | Qué | Para cuándo |
|---|---|---|
| K1 | Componente `CalendarioEspacio` con props `{ codigoEspacio, modo: 'lectura' \| 'seleccion', fechaInicial?, onSeleccion?(franja: { inicio, fin }) }`. | Jue 15 (marcador con las props) · Vie 16 (funcional) |
| K2 | `src/lib/tipos-solicitudes.ts` y `src/lib/solicitudes.ts`: tipos y llamadas de `POST /solicitudes`, `PATCH /solicitudes/:id`, ítems de reserva y servicio, documentos, `enviar`, `GET /solicitudes` y `GET /solicitudes/:id` (con historial de estados). | Lun 19 en la mañana (tipos) · según su día a día (endpoints) |
| K3 | `SolicitudesService.transicionar(tx, solicitudId, evento, usuarioId, observacion?)`, exportado por `ReservasModule`. Tus actas cambian el estado (`ENTREGAR`, `DEVOLVER_ESPACIO`) **solo** por ahí. | Antes del Lun 26 |
| K4 | Error `409 FRANJA_NO_DISPONIBLE` con `detalles.conflictos` y `detalles.sugerencias`, para mostrarlo en el paso 1. | Mié 21 |

**Si un contrato no llegó el día previsto:** no entres al territorio de Kevin. Trabaja contra los tipos publicados con un estado "pendiente" en pantalla y avisa en el daily.

## 6. Tareas en orden

Cada tarea es un PR pequeño hacia `develop`. Marca cada una cuando cumpla el "Terminado" de la sección 8.

### Semana 1 · Inventario y portal

| Día | Tarea | Se acepta cuando |
|---|---|---|
| Mié 14 | Backend: CRUD de administración de sedes, bloques y tipos de espacio (`@Roles('ADMINISTRADOR')`). Publica la firma de I1. | Aparecen en Swagger con DTO y errores; nada se borra físicamente (se desactiva); código repetido responde `409`. |
| Jue 15 | Backend: CRUD de administración de espacios y elementos (editar, archivar). Implementa I1. | Archivar rechaza si hay franjas futuras `RETENIDA`/`CONFIRMADA`; el historial de estado de elemento se escribe al cambiarlo. |
| Vie 16 | Frontend: página del bloque completa (plano, espacios por piso, filtros por tipo y capacidad mínima, `IndicadorAforo`). | Con `?asistentes=` se atenúan los que no caben y se advierte donde sobra espacio. |
| Sáb 17 | Frontend: ficha del espacio (galería, dotación, condiciones, tarifas) con `CalendarioEspacio` de Kevin en modo lectura. | Sin fotos muestra el marcador; nunca aparece la tarifa interna ni el responsable. |
| Dom 18 | Carga de fotos: I2 (`AlmacenamientoPort` + adaptador S3), `POST /espacios/:codigo/fotos` (máx. 10 MB, tipo validado por contenido, variantes WebP con `sharp`, texto alternativo obligatorio, una sola portada), `CargadorArchivos`. | ⚠️ Bloqueo previo: falta la imagen de MinIO (ver `05`, "Desviaciones"). Pídele la decisión a Jensen antes del sábado. |

**Hito:** un visitante navega Mocoa → Bloque B → un espacio y ve fotos, aforo, dotación y el calendario con una clase bloqueada.

### Semana 2 · Asistente de solicitud (solo frontend)

| Día | Tarea | Se acepta cuando |
|---|---|---|
| Lun 19 | Backend: I3 (catálogo de servicios y proveedores, CRUD admin y `GET /servicios`). Frontend: paso 1 del asistente, selección de franjas en `CalendarioEspacio` modo selección, validación de anticipación y aforo con sugerencias. | El aforo mayor a la capacidad bloquea y sugiere; nada se retiene todavía. |
| Mar 20 | Pasos 2 y 3: servicios filtrados por tipo de espacio, datos del evento. Guardado automático del borrador. | Recargar la página no pierde nada. |
| Mié 21 | Paso 4: identificación (uso institucional o particular, dependencia, documentos con `CargadorArchivos`). | El cliente **nunca** envía `esExenta`; la póliza se pide si el aforo la exige. |
| Jue 22 | Paso 5: resumen con desglose (`ResumenCotizacion`) o "$0 · valor de referencia". Envío con manejo de K4. | En una solicitud exenta no aparece ninguna sección de pago. |
| Vie 23 | "Mis solicitudes": lista con estado (`InsigniaEstado`) y próxima acción. | Vacío: "Todavía no has hecho ninguna solicitud. Busca un espacio." |
| Sáb 24 | Detalle de solicitud con `LineaTiempoSolicitud`. | Un id ajeno muestra 404. |
| Dom 25 | Corrección de bugs de la demo del jueves. | |

El paso 6 (pago) lo construye Jensen dentro de `(cuenta)/solicitar/`: es la única excepción a tu territorio y se coordina por PR revisado por ti.

**Hito:** el recorrido del docente (exento) funciona completo en pantalla.

### Semana 3 · Actas, tablero y accesibilidad

| Día | Tarea | Se acepta cuando |
|---|---|---|
| Lun 26 | Acta de entrega: `POST /actas` tipo `ENTREGA`, checklist armado desde los elementos del espacio, fotos con la cámara del celular. Estado por K3. | Solicitud `CONFIRMADA` → `EN_USO`; consecutivo `ACT-` desde `ConsecutivoService`. |
| Mar 27 | Acta de devolución con novedades y valor del daño. | `EN_USO` → `FINALIZADA`; una sola acta de cada tipo por solicitud. |
| Mié 28 | Tablero: ocupación, solicitudes por estado, recaudo, tiempo medio de aprobación, uso interno no cobrado. | `reportes` **solo lee** (nunca escribe) las tablas de otros módulos. |
| Vie 30 | Pasada de accesibilidad (teclado, contraste, `alt`, foco) y de 360 px en todo el frontend. | Los arreglos en pantallas de Kevin o Jensen van como PR aparte, revisado por el dueño. |
| Sáb 31 | Pulido visual, estados vacíos y de error. | |
| Dom 1 | Congelamiento y ensayo de la demo. Nada nuevo después del mediodía. | |

## 7. Flujo de trabajo diario

```bash
git switch feature/isabel
git fetch origin && git merge origin/develop     # cada mañana, antes de escribir código
# ... trabajas una tarea ...
git add -A && git commit -m "feat: carga de fotos de espacios"
git push
```

1. Abre un pull request de `feature/isabel` hacia `develop` al terminar cada tarea (máximo dos días de vida).
2. Lo aprueba otra persona. Jensen revisa todo lo que toque `shared/`, `app.module.ts` o el esquema.
3. Después de fusionar, vuelve a traer `develop` a tu rama.
4. Commits en español con Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`).
5. Si una tarea toca los dos repos, son dos PR con el mismo título.

## 8. Terminado

- `npm run build`, `npm run test` y `npm run lint` pasan en el repo que tocaste.
- Endpoint con DTO validado y visible en Swagger, con sus respuestas de error.
- Regla de negocio nueva con su prueba unitaria.
- Pantalla con sus cinco estados (cargando, vacío, datos, error, sin permiso), funciona en 360 px y se usa con teclado.
- Ningún archivo fuera de tu territorio aparece en el PR, salvo los "compartidos" con su regla.

## 9. Reglas que tu agente no rompe

- Nada de autenticación, tarifas, aprobaciones, pagos ni disponibilidad: no son tuyos.
- Nunca consultas ni escribes tablas de otro módulo: usas el servicio exportado (excepción: `reportes`, solo lectura).
- Nunca validas disponibilidad en el cliente: la decide la base de datos.
- Ningún dato personal en endpoints públicos. Dinero en pesos enteros. Fechas en UTC; `America/Bogota` solo al mostrar.
- Nada se borra físicamente. Colores solo por tokens de `globals.css`. Todo fetch por `src/lib/api.ts`.
- Si dos documentos se contradicen o necesitas salir de tu territorio: **para y pregunta a Jensen**.
