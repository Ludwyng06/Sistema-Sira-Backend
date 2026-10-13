# Proyecto: SIRA · Sistema de Inventario y Reserva de Activos · Uniputumayo

> Pega este archivo completo como contexto inicial de cualquier agente de programación. Antes de escribir código, el agente debe leer los documentos de `docs/architecture/` que correspondan a la tarea.

## Qué estamos construyendo

Una plataforma web para que la Institución Universitaria del Putumayo administre sus espacios físicos (aulas, salas de informática, laboratorios, auditorios, canchas) organizados por **sede → bloque (A, B, C) → espacio**, publique su disponibilidad en un calendario y tramite reservas: la comunidad universitaria las pide **sin costo** para uso institucional, y los externos (personas, empresas, entidades) las **alquilan** con cotización y pago. Reemplaza el proceso actual, en el que la Vicerrectoría recibe todo por correo y lo controla en un Excel.

## Estado actual

**La Fase 0 ya está hecha**, en dos repositorios independientes: [Sistema-Sira-Backend](https://github.com/Ludwyng06/Sistema-Sira-Backend) (NestJS 12 + Prisma 7, con el esquema, las restricciones SQL, la migración inicial, el seed y el módulo `inventario` de ejemplo) y [Sistema-Sira-Frontend](https://github.com/Ludwyng06/Sistema-Sira-Frontend) (Next.js 16). La receta está en `docs/architecture/09-inicializacion-y-git.md`. La copia de `docs/` del Backend es la fuente de verdad. Ahora se sigue el plan de `08-plan-de-trabajo-20-dias.md`.

Los anexos ya están probados y se copian **tal cual**, no se reescriben:

| Anexo | Destino | Qué es |
|---|---|---|
| `schema.prisma` | `prisma/schema.prisma` (repo Backend) | Modelo de datos completo, validado con Prisma 7.10 |
| `restricciones.sql` | `prisma/sql/restricciones.sql` (repo Backend) | Restricción de no solapamiento, CHECKs y bitácora inmutable (probado en PostgreSQL 16, incluida la prueba de carrera) |
| `maquina-estados.ts` + `.spec.ts` | `src/modules/reservas/dominio/` (repo Backend) | Transiciones válidas de la solicitud |
| `aforo.ts` + `.spec.ts` | `src/modules/inventario/dominio/` (repo Backend) | Evaluación de aforo y orden por ajuste (RN-18 + aporte E2) |
| `pasarela.port.ts` | `src/modules/pagos/puertos/` (repo Backend) | Puerto de pagos (solo la interfaz) |

## Alcance de esta fase (avance de 20 días, hasta el 1 de nov. de 2026)

**Entra:** autenticación con verificación de correo y dominios institucionales · los seis roles con autorización por recurso · inventario por bloques con fotos y elementos · calendario con disponibilidad real, bloqueos y retenciones · solicitud con espacios y servicios · aval y aprobación (aprobar, rechazar, devolver, reclasificar) · flujo exento · cotización con PDF · pago **por consignación** con verificación de tesorería · actas de entrega y devolución · tablero básico · bitácora.

**NO entra todavía:** pasarela de pago en línea, webhooks, factura electrónica, reembolsos, WhatsApp, inicio de sesión con Google/Microsoft, segundo factor, importación masiva, firma táctil, mapa de calor, QR, iCal. No implementar nada de esto aunque parezca fácil; deja el puerto `PasarelaPort` definido y nada más.

## Stack acordado

| Capa | Tecnología |
|---|---|
| Repositorios | Dos repositorios independientes (Backend y Frontend), pnpm 10, Node 22 |
| Backend | NestJS 12 (módulos ES: imports relativos con extensión `.js`), TypeScript, class-validator, @nestjs/swagger, @nestjs/jwt + passport-jwt, @nestjs/throttler, @nestjs/schedule, BullMQ |
| BD | PostgreSQL 16 + Prisma 7.10 con `@prisma/adapter-pg`; cliente generado en `src/generated/prisma` |
| Frontend | Next.js 16 App Router, React 19, Tailwind CSS 4, FullCalendar 6, lucide-react |
| Pruebas | Vitest (back) |
| Infra local | Docker Compose |

**Next.js 16 tiene APIs que pueden diferir de tu entrenamiento: lee `node_modules/next/dist/docs/` del repositorio Frontend antes de usar algo que no esté ya en el código.**

## Modelo de datos

La fuente de verdad es `prisma/schema.prisma` del repositorio Backend (copiado de `docs/architecture/anexos/`); léelo completo antes de tocar cualquier módulo. Resumen:

- **Identidad:** `Usuario` (correo único, hash Argon2id, `correoVerificado`, `esInstitucional`) · `UsuarioRol` (rol + dependencia opcional) · `Solicitante` (perfil 1:1: tipo, documento, razón social) · `Dependencia` (dueña de espacios, `jefeId` = aprobador) · `SesionRefresh` · `CodigoVerificacion` · `ConsentimientoDatos`.
- **Inventario:** `Sede` → `Bloque` (`planoUrl`) → `Espacio` (`codigo` según plano tipo `A-201`, `piso`, `capacidadPersonas`, montaje/desmontaje, depósito, `responsableId`, `dependenciaId`) → `Elemento`. `TipoEspacio` (anticipación mínima, aforo que exige póliza). `HorarioOperacion`. `Fotografia` (de espacio, elemento o servicio; texto alternativo obligatorio).
- **Servicios y tarifas:** `Proveedor`, `ServicioComplementario`, `Tarifa` (de espacio o servicio, por tipo de solicitante y unidad, con vigencia y acuerdo soporte), `Recargo`, `Festivo`, `Smmlv`.
- **Disponibilidad:** `FranjaOcupada` es la **tabla única de ocupación** (reservas y bloqueos). Columna generada `periodo` + restricción de exclusión `sin_solapamiento` en SQL. `BloqueoCalendario` (con RRULE, se expande en franjas).
- **Solicitudes:** `Solicitud` (consecutivo, `esExenta`, `tipoTarifa`, `estado`, `venceEn`) · `HistorialEstadoSolicitud` · `ReservaItem` · `ServicioItem` · `DocumentoAdjunto` · `Decision` (AVAL/APROBACION) · `Cotizacion` (desglose congelado).
- **Pagos:** `OrdenPago` (referencia única, medio, estado) · `EventoPasarela` · `Reembolso`.
- **Actas:** `Acta` (entrega/devolución, checklist JSON) · `Novedad`.
- **Transversales:** `Consecutivo`, `Bitacora` (inmutable por trigger), `Notificacion`, `PlantillaCorreo`, `Parametro`.

## Reglas de negocio innegociables

Lista completa en `docs/architecture/03-backend.md` §3. Las que nunca se rompen:

1. Un espacio nunca tiene dos franjas activas solapadas. Lo garantiza la BD; el código traduce el error `23P01` a `409 FRANJA_NO_DISPONIBLE` con conflictos y sugerencias. **Nunca** valides disponibilidad solo en código ni en el cliente.
2. Toda transición de estado de una solicitud pasa por `SolicitudStateMachine`, escribe historial y bitácora, y actualiza las franjas en la **misma transacción**.
3. Exención (RN-07): dominio institucional **verificado** + declara uso institucional + dependencia asociada + aval aprobado. La calcula el servidor; el cliente nunca envía `esExenta`.
4. En una solicitud exenta no existe ninguna sección ni endpoint de pago (`POST /pagos/ordenes` → `422 SOLICITUD_EXENTA`), pero se calcula `valorReferencia`.
5. Dos plazos: revisión 72 h (recordatorio 24 h, escalamiento 48 h) y pago 48 h desde que queda cotizada. Leer de `Parametro`, nunca constantes en código.
6. La tarifa se congela en la cotización (RN-05).
7. Rechazar, devolver y reclasificar exigen motivo escrito.
8. Consecutivos (`SOL-`, `COT-`, `OP-`, `ACT-`) desde `ConsecutivoService`, nunca de `count()`.
9. Autorización por recurso: un usuario que pide un registro ajeno recibe `404`.
10. Dinero en pesos enteros (`Int`). Nunca `float`. Porcentajes en `Decimal`.
11. Nada se borra físicamente: se archiva o cambia de estado.
12. Ningún dato personal del solicitante en endpoints públicos: el calendario público dice "Ocupado" o la etiqueta pública autorizada.

## Convenciones

- **Idioma:** dominio en español sin tildes en identificadores (`solicitud`, `espacioId`, `capacidadPersonas`); términos técnicos en inglés (`controller`, `service`, `dto`, `guard`). Mensajes al usuario en español con tildes.
- **Backend:** `src/modules/<modulo>/{controllers,dto,services}`. Controladores sin lógica. Reglas en servicios. Un módulo usa a otro solo por su servicio exportado. Copia la estructura de `modules/inventario`.
- **Errores:** lanza `ErrorDominio(codigo, mensaje, status, detalles?)`. El mensaje es para el usuario final.
- **DTO:** `class-validator` en todo lo que entra; `@ApiProperty` para Swagger.
- **Rutas:** prefijo `/api`, recursos en plural y en español (`/solicitudes/:id/decisiones`). Paginación `?pagina&porPagina` → `{ datos, total, pagina, porPagina }`.
- **Fechas:** UTC en BD y API (ISO 8601); `America/Bogota` solo al mostrar. Formato `dd/mm/aaaa`, pesos `$1.250.000`.
- **Frontend:** Server Components para lo público; Client Components solo para lo interactivo. Todo fetch por `src/lib/api.ts`. Toda pantalla con sus cinco estados. Colores solo por tokens de `globals.css`. Estado del calendario nunca solo con color.
- **Variables de entorno:** `.env` (no versionado) a partir de `.env.example`. Toda variable nueva se agrega al `.env.example` y a la validación de `shared/config`.
- **Commits:** español, Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`).
- **Migraciones:** `pnpm db:migrate --name <descripcion>`. Revisa que el SQL generado no toque `sin_solapamiento` ni `periodo`.

## Cómo quiero trabajar

1. Antes de programar, lee el documento del módulo y resume en 3–5 líneas qué vas a hacer y qué archivos vas a tocar.
2. Trabaja en tareas pequeñas: un endpoint o una pantalla a la vez, con su prueba.
3. Si una regla del documento base y de `docs/architecture/` parece contradecirse, **pregunta**; no elijas tú. `07-cambios-documento-base.md` dice cuál prevalece.
4. Si necesitas cambiar `schema.prisma`, dilo antes y explica por qué.
5. No agregues dependencias nuevas sin decir para qué y qué alternativa descartaste.
6. Al terminar: qué hiciste, cómo probarlo (comandos y URL) y qué quedó pendiente.

## Criterio de terminado

- `pnpm build` y `pnpm test` pasan en la raíz.
- El endpoint aparece en Swagger con sus DTO y respuestas de error.
- Cada regla de negocio nueva tiene prueba unitaria; las de concurrencia, prueba contra PostgreSQL real.
- La pantalla tiene los cinco estados, funciona a 360 px, se usa con teclado y pasa axe sin errores.
- Las acciones sensibles quedan en la bitácora.

## Decisiones ya tomadas (no reabrir)

- **Dos repositorios, uno por aplicación (Backend y Frontend), con pnpm**: decisión del equipo.
- **Tabla única de ocupación** con restricción de exclusión: es lo que hace imposible la doble reserva contra clases y mantenimientos.
- **Pesos enteros** en vez de centavos: COP no tiene decimales; ×100 solo en el adaptador de pasarela.
- **Pago por consignación primero**, pasarela después: así funciona hoy y no depende del convenio.
- **Hexagonal solo en pagos, almacenamiento y correo**: el resto, servicios de NestJS.
- **Navegación por bloques**, no un buscador con todo: es la propuesta central del equipo.
- **Devuelta vuelve a borrador**, **aval negado = rechazada**, **interno particular = tarifa persona natural**.

## ⚠️ Supuestos por confirmar

- Quién aprueba: dependencia dueña del espacio (default) o Vicerrectoría.
- Anticipación para auditorio y escenarios: 2 días (Vicerrectoría) vs. 8 hábiles (documento base).
- Plataforma de pagos existente `pagos.uniputumayo.edu.co`: ¿se integra en lugar de una pasarela nueva?
- Advertencia de "espacio demasiado grande": umbral del 30 % de la capacidad.
- Estudiantes: aval de un docente o del jefe del programa.
- Cifrado en reposo a nivel de disco, no por columna, en la v1.
- Los datos del seed (espacios, capacidades, tarifas) son de ejemplo hasta recibir los planos y el acuerdo de tarifas.
