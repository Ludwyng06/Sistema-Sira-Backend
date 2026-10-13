# SIRA · Misión del agente de Isabel Cerón · BACKEND

> Pega este archivo completo como contexto inicial de tu agente de programación, junto con `PROMPT-MAESTRO.md`.
> Cubre los 20 días (13 oct. – 1 nov. 2026). **Reemplaza el reparto por módulos de `docs/architecture/08-plan-de-trabajo-20-dias.md`**: ahora el reparto es por repositorio.
> Documento hermano: `docs/equipo/mision-kevin.md` (frontend).

## 1. Tu papel

Eres la dueña de **todo el backend** (`Sistema-Sira-Backend`). Kevin es el dueño de **todo el frontend** (`Sistema-Sira-Frontend`). Jensen es el líder técnico: revisa los pull request, aprueba cambios al esquema, mantiene la documentación y decide lo que este documento no resuelva.

**Así no chocan:** tú solo escribes en el repo Backend y Kevin solo en el repo Frontend. Lo único que cruza entre los dos es **el contrato de la API**, y ese contrato lo publicas tú en Swagger (sección 4).

## 2. Antes de empezar

1. Lee `PROMPT-MAESTRO.md`, `docs/architecture/02-data-model.md`, `03-backend.md` y el módulo `src/modules/inventario`: es el ejemplo de cómo se escribe todo lo demás.
2. Requisitos: Node.js 22.22.3 o superior, Docker Desktop, Git, puerto 5432 libre.
3. Arranque:

   ```bash
   npm install && cp .env.example .env
   npm run db:up && npm run db:migrate && npm run db:seed
   npm run dev                      # http://localhost:3001/docs
   ```
4. Tu rama es `feature/isabel` **en el repo Backend**. Nunca trabajas en `main` ni en `develop`.

## 3. Tu territorio

| Editas | No tocas |
|---|---|
| Todo `src/**` del repo Backend: `modules/`, `shared/`, `main.ts`, `app.module.ts`. | El repo `Sistema-Sira-Frontend`, ni un archivo. Si una pantalla necesita algo, Kevin te lo pide y tú cambias la API. |
| `prisma/seed.ts`, `test/**`, `scripts/**`. | `prisma/schema.prisma`, `prisma/sql/restricciones.sql` y `prisma/migrations/**` sin el visto bueno de Jensen: para y explica por qué antes de tocarlos. |
| `.env.example` + `src/shared/config/configuracion.ts` (toda variable nueva va en los dos). | `docs/**` y `PROMPT-MAESTRO.md`: los mantiene Jensen. Si la API queda distinta a `03-backend.md`, avísale para que lo corrija. |
| `package.json` (dependencia nueva: di para qué y qué alternativa descartaste, en un PR aparte). | `docker-compose.yml` sin avisar: Kevin lo usa para levantar tu backend. |

## 4. El contrato con Kevin: contrato primero

Kevin construye las pantallas **un paso detrás de ti**. Para que nunca espere:

1. **Antes de implementar un módulo, publicas su contrato.** Un PR pequeño con el controlador, los DTO de entrada y de respuesta (`@ApiProperty`), los `@ApiResponse` de error y el servicio respondiendo `501 NO_IMPLEMENTADO`. Se fusiona a `develop` el mismo día, en la mañana.
2. **Swagger es la única fuente del contrato** (`http://localhost:3001/docs`, JSON en `/docs-json`). Kevin copia de ahí sus tipos; no los inventa.
3. **Después implementas** en uno o varios PR, sin cambiar la forma publicada.
4. **Si tienes que cambiar un contrato ya publicado:** avisa en el grupo antes, y titula el PR `feat!: ...` con una línea "CAMBIO DE CONTRATO: antes → ahora".
5. **Kevin te pide cosas con un issue** en el repo Backend (etiqueta `contrato`): qué pantalla, qué campo o endpoint le falta. Tú respondes ahí.
6. **`develop` del Backend siempre arranca.** Kevin lo levanta cada mañana con `git pull && npm install && npm run db:migrate && npm run db:seed && npm run dev`. Si agregas una migración o cambias el seed, dilo en el grupo.

Reglas de forma que Kevin da por hechas en todos los endpoints:

- Prefijo `/api`, recursos en plural y en español. Paginación `?pagina&porPagina` → `{ datos, total, pagina, porPagina }`.
- Errores `{ codigo, mensaje, detalles?, correlacionId }`, con `mensaje` escrito para el usuario final.
- Fechas ISO 8601 en UTC. Dinero en pesos enteros.
- Un recurso ajeno responde `404`, no `403`.
- Login: access token en el cuerpo (`accessToken`) y refresh en cookie `httpOnly`.

## 5. Tareas en orden

Cada fila es un PR (o dos: contrato + implementación). ⏬ = recortable si el tiempo no alcanza.

### Semana 1 · Identidad, inventario y disponibilidad (13–18 oct.)

| Día | Tarea | Se acepta cuando |
|---|---|---|
| Mar 13 | Levantar el proyecto. **Publicar hoy el contrato de identidad** (`/auth/*`) para que Kevin empiece mañana. | Los endpoints de `/auth` aparecen en Swagger con sus DTO. |
| Mié 14 | Identidad 1: `POST /auth/registro` (consentimiento con versión, IP y fecha; detección de dominio institucional desde `Parametro`; Argon2id), verificación de correo por código de 6 dígitos (15 min, 5 intentos), `CorreoPort` con adaptador SMTP a Mailpit. | Códigos guardados con hash; el correo llega a `http://localhost:8025`; sin verificar no hay exención. |
| Jue 15 | Identidad 2: `POST /auth/ingresar`, refresh rotativo con revocación de familia, `/auth/salir`, `/auth/yo`, bloqueo tras 5 intentos. Guardas con sesión real y alcance por dependencia. Contrato de inventario de administración. | Respuesta idéntica exista o no el correo en recuperación; `@UsuarioActual()` trae roles y dependencias. |
| Vie 16 | Inventario de administración: CRUD de sedes, bloques, tipos, espacios y elementos. Contrato de disponibilidad. | Nada se borra (archivar o desactivar); archivar rechaza si hay franjas futuras activas. |
| Sáb 17 | Disponibilidad: `DisponibilidadService.consultar`, `GET /disponibilidad`, `POST /bloqueos` con RRULE (librería `rrule`) que expande a franjas `BLOQUEO`. | Filtra con `periodo && tstzrange(...)`; el público solo ve "Ocupado" o `etiquetaPublica`; un bloqueo que choca responde `409`. |
| Dom 18 | `GET /disponibilidad/buscar` (búsqueda inversa con `ordenarPorAjuste`). Interceptor `@Auditar`. ⏬ Carga de fotos (`AlmacenamientoPort`, variantes WebP). | ⚠️ Las fotos dependen de que Jensen elija la imagen que reemplaza a MinIO (`05`, "Desviaciones"). |

**Hito:** un usuario se registra con `@itp.edu.co`, verifica su correo y entra; el calendario de un espacio muestra una clase bloqueada.

### Semana 2 · Solicitud, aprobación y cotización (19–25 oct.)

| Día | Tarea | Se acepta cuando |
|---|---|---|
| Lun 19 | Contrato de solicitudes, servicios y tarifas (a primera hora). Catálogo de servicios y proveedores. `TarifarioService.calcular()` y `POST /tarifas/calcular`. | Tarifa vigente, unidad más conveniente, recargos nocturno, dominical y festivo; pruebas unitarias. |
| Mar 20 | `POST /solicitudes` (borrador), `PATCH`, ítems de reserva y servicio. Servicio de la máquina de estados sobre `validarTransicion` (no se reescribe el anexo). | Solo el dueño ve su borrador; ningún código cambia `solicitud.estado` por fuera de la máquina. |
| Mié 21 | **UC-01** `POST /solicitudes/:id/enviar`: validaciones (RN-04, RN-18, RN-19, RN-20), RN-07 (exención), transacción con consecutivo `SOL-`, franjas `RETENIDA`, `venceEn` desde `Parametro`, error `23P01` → `409 FRANJA_NO_DISPONIBLE` con conflictos y sugerencias. Contrato de decisiones. | El cliente nunca envía `esExenta`. Dos envíos sobre la misma franja: el segundo recibe `409`. |
| Jue 22 | **UC-02** `POST /solicitudes/:id/decisiones`: aval y aprobación, rechazar, devolver y reclasificar con motivo obligatorio. Exenta aprobada → `CONFIRMADA`. `GET /solicitudes` según rol y `GET /solicitudes/:id` con historial. | Autorización por recurso: responsable y aprobador solo ven lo suyo. |
| Vie 23 | Cotización: consecutivo `COT-`, desglose congelado, `valorReferencia` en exentas. Prueba de carrera (RNF-05) contra PostgreSQL real. | De dos transacciones simultáneas, exactamente una confirma. |
| Sáb 24 | Documentos adjuntos y cancelación por el solicitante (libera franjas). Contrato de pagos y actas. | Póliza obligatoria si el aforo supera `aforoExigePoliza`. |
| Dom 25 | Corrección de bugs. | |

**Hito (sábado 24):** el recorrido del docente (exento) funciona completo por la API. Dos solicitudes sobre la misma franja no coexisten.

### Semana 3 · Pago, actas, jobs y panel (26 oct.–1 nov.)

| Día | Tarea | Se acepta cuando |
|---|---|---|
| Lun 26 | **UC-03** `POST /pagos/ordenes` (consignación, referencia `OP-`, datos de `Parametro.cuenta_recaudo`), carga del soporte, `POST /pagos/ordenes/:id/verificacion` de tesorería. | Exenta → `422 SOLICITUD_EXENTA`. Pago aprobado → solicitud y franjas `CONFIRMADA`. |
| Mar 27 | Actas: `POST /actas` de entrega (`CONFIRMADA` → `EN_USO`) y de devolución (`EN_USO` → `FINALIZADA`) con checklist desde los elementos y novedades. | Consecutivo `ACT-`; una sola acta de cada tipo por solicitud. |
| Mié 28 | Job de vencimientos (revisión y pago) que libera franjas. Correos de cada cambio de estado y `GET /notificaciones`. ⏬ Job de recordatorios. | Plazos leídos de `Parametro`; una orden en verificación no vence. |
| Jue 29 | `GET /reportes/tablero` (ocupación, solicitudes por estado, recaudo, tiempo medio de aprobación, uso interno no cobrado) y `GET /auditoria`. ⏬ PDF de cotización. | El tablero solo lee. |
| Vie 30 | Pruebas de punta a punta de UC-01 a UC-03. Usuarios, dependencias y parámetros (CRUD de administración). | |
| Sáb 31 | Corrección de bugs. Seed con datos reales si ya llegaron los planos. | |
| Dom 1 | Congelamiento y ensayo de la demo. Nada nuevo después del mediodía. | |

**Orden de recorte** (`08` §5): recordatorios → PDF de cotización → tablero completo (queda el conteo por estado) → fotos en el acta. **Nunca** se recorta: la restricción de no solapamiento, la máquina de estados, el flujo exento sin pago y la autorización por recurso.

## 6. Flujo de trabajo diario

```bash
git switch feature/isabel
git fetch origin && git merge origin/develop     # cada mañana
# ... una tarea ...
git add -A && git commit -m "feat: registro con verificación de correo"
git push
```

1. Pull request de `feature/isabel` hacia `develop` al terminar cada tarea (máximo dos días de vida). El PR de contrato va primero y solo.
2. Lo aprueba Jensen (o Kevin, si solo cambia un contrato que él pidió).
3. Después de fusionar, vuelve a traer `develop` a tu rama.
4. Commits en español con Conventional Commits (`feat:`, `fix:`, `test:`, `refactor:`).

## 7. Terminado

- `npm run build`, `npm run test` y `npm run lint` pasan.
- El endpoint aparece en Swagger con sus DTO y sus respuestas de error.
- Cada regla de negocio nueva tiene prueba unitaria; las de concurrencia, contra PostgreSQL real.
- Las acciones sensibles quedan en la bitácora.
- El PR no trae ningún archivo de `docs/`, del esquema ni del repo Frontend.

## 8. Reglas que tu agente no rompe

- La disponibilidad nunca se valida solo en código: la garantiza `sin_solapamiento` y tú traduces el `23P01`.
- Toda transición pasa por la máquina de estados, escribe historial y bitácora y actualiza las franjas en la **misma transacción**.
- Consecutivos desde `ConsecutivoService`, nunca de `count()`. Plazos desde `Parametro`, nunca constantes.
- Un módulo usa a otro solo por su servicio exportado. Controladores sin lógica.
- Ningún dato personal en endpoints públicos. Nada se borra físicamente. Dinero en pesos enteros, nunca `float`.
- Hexagonal solo en pagos, almacenamiento y correo. De la pasarela solo existe el puerto `PasarelaPort`: no se implementa.
- Migraciones: `npm run db:nueva-migracion -- --name <descripcion>`, borrando a mano la sentencia `ALTER COLUMN periodo DROP DEFAULT`, y solo con el visto bueno de Jensen.
- Si dos documentos se contradicen o algo no está aquí: **para y pregunta a Jensen**.
