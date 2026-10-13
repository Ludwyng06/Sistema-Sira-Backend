# SIRA · Backend

**SIRA** (Sistema de Inventario y Reserva de Activos) es la plataforma web con la que la Institución Universitaria del Putumayo administra sus espacios físicos por **sede → bloque → espacio**, publica su disponibilidad y tramita reservas (sin costo para uso institucional y con cotización y pago para externos). Este repositorio es el **backend** (NestJS 12 + Prisma 7 + PostgreSQL 16). Visión completa: [`docs/architecture/01-project-vision.md`](docs/architecture/01-project-vision.md).

- Repositorio del frontend: <https://github.com/Ludwyng06/Sistema-Sira-Frontend>
- **La copia de `docs/` de este repositorio es la fuente de verdad** de la documentación y de los anexos (esquema Prisma, restricciones SQL, lógica de dominio).

## Requisitos

- **Node.js 22.22.3 o superior** (rama 22 LTS). Con un Node 22 más viejo, `npm run build`, `npm run start` y `npm run dev` fallan con `ERR_REQUIRE_CYCLE_MODULE` (la CLI de NestJS 12 usa `@angular-devkit` 22, que exige esa versión). `.nvmrc` apunta a `22`.
- npm (el que trae Node).
- Docker Desktop.
- Git.

## Arranque

```bash
npm install
cp .env.example .env
npm run db:up
npm run db:init      # solo quien crea el repo; los demás usan: npm run db:migrate
npm run db:seed
npm run dev          # o npm run start
```

> Este repositorio ya trae la migración inicial en `prisma/migrations/`. Quien lo clona usa `npm run db:migrate`.

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor con recarga (puerto 3001). |
| `npm run start` / `npm run start:prod` | Servidor / servidor ya compilado (`dist/`). |
| `npm run build` · `npm run test` · `npm run lint` | Compilar, pruebas (Vitest) y lint (oxlint). |
| `npm run db:up` / `db:down` | Levanta / apaga PostgreSQL, Redis y Mailpit con Docker. |
| `npm run db:init` | Crea la migración inicial y le anexa `prisma/sql/restricciones.sql` (solo la primera vez). |
| `npm run db:migrate` | Aplica las migraciones existentes (`prisma migrate deploy`). |
| `npm run db:nueva-migracion -- --name <descripcion>` | Crea una migración nueva sin aplicarla (ver abajo). |
| `npm run db:seed` | Datos de ejemplo (idempotente). |
| `npm run db:reset` | Borra y recrea la base (pide confirmación). |

### MinIO (opcional)

Las imágenes `minio/minio` y `minio/mc` ya no se publican en Docker Hub, así que los servicios de almacenamiento del `docker-compose.yml` están bajo el perfil `almacenamiento` y **no** se levantan con `npm run db:up`. La Fase 0 no los usa todavía.

## URLs y puertos

| Servicio | Puerto | URL |
|---|---|---|
| Frontend | 3000 | <http://localhost:3000> |
| Backend (API) | 3001 | <http://localhost:3001/api> |
| Swagger | 3001 | <http://localhost:3001/docs> |
| PostgreSQL | 5432 | `postgresql://sira:sira@localhost:5432/sira` |
| Redis | 6379 | |
| Mailpit | 8025 | <http://localhost:8025> |
| MinIO (perfil `almacenamiento`) | 9000 / 9001 | <http://localhost:9001> (sira / sira-secreto) |

Comprobación rápida: `GET http://localhost:3001/api/salud` responde `{"estado":"ok","baseDeDatos":"ok"}`.

## Usuarios de prueba

Contraseña de todos: `Sira2026*` (todos con correo verificado).

| Correo | Rol |
|---|---|
| `admin@itp.edu.co` | ADMINISTRADOR |
| `vicerrectoria@itp.edu.co` | APROBADOR (jefe de la Vicerrectoría Administrativa) |
| `auditorio@itp.edu.co` | Responsable del espacio B-101 |
| `tesoreria@itp.edu.co` | TESORERIA |
| `control.interno@itp.edu.co` | AUDITOR |
| `docente@itp.edu.co` | SOLICITANTE interno (Facultad de Ingeniería) |
| `empresa@ejemplo.com` | SOLICITANTE empresa (con NIT) |
| `persona@ejemplo.com` | SOLICITANTE persona natural |

> En la Fase 0 todavía no existe el login: estas cuentas quedan sembradas para cuando se construya el módulo de identidad.

## Migraciones

Con la columna generada `periodo` de `franja_ocupada`, Prisma detecta siempre una diferencia (`ALTER TABLE "franja_ocupada" ALTER COLUMN "periodo" DROP DEFAULT;`) que PostgreSQL no puede aplicar. Por eso:

- **Aplicar** las migraciones existentes: `npm run db:migrate` (usa `prisma migrate deploy`, sin preguntas).
- **Crear** una migración nueva: `npm run db:nueva-migracion -- --name descripcion`. Abre el `migration.sql` generado y **borra a mano** la sentencia `ALTER ... "periodo" DROP DEFAULT`; luego aplícala con `npm run db:migrate`.
- Revisa que el SQL generado no toque `sin_solapamiento` ni `periodo`. Si lo hace, vuelve a anexar `prisma/sql/restricciones.sql` (es idempotente).
- Solo una persona a la vez cambia `prisma/schema.prisma`, y avisa en el grupo.

## Mapa de la documentación

| Archivo | Para qué |
|---|---|
| [`PROMPT-MAESTRO.md`](PROMPT-MAESTRO.md) | Contexto completo: alcance, stack, reglas innegociables y convenciones. |
| [`docs/architecture/01-project-vision.md`](docs/architecture/01-project-vision.md) | Qué es, qué problema resuelve, usuarios, alcance. |
| [`docs/architecture/02-data-model.md`](docs/architecture/02-data-model.md) | Entidades, diagrama ER, tabla única de ocupación, máquina de estados. |
| [`docs/architecture/03-backend.md`](docs/architecture/03-backend.md) | Módulos, autenticación, reglas de negocio, casos de uso, endpoints, errores. |
| [`docs/architecture/04-frontend.md`](docs/architecture/04-frontend.md) | Navegación por bloques, identidad visual, pantallas. |
| [`docs/architecture/05-stack-and-operations.md`](docs/architecture/05-stack-and-operations.md) | Versiones, entornos, puertos, pruebas. |
| [`docs/architecture/06-roadmap.md`](docs/architecture/06-roadmap.md) | Etapas del proyecto. |
| [`docs/architecture/07-cambios-documento-base.md`](docs/architecture/07-cambios-documento-base.md) | Correcciones al documento base y preguntas para Vicerrectoría. |
| [`docs/architecture/08-plan-de-trabajo-20-dias.md`](docs/architecture/08-plan-de-trabajo-20-dias.md) | **Plan de trabajo**: reparto día a día y guion de la demo. |
| [`docs/architecture/09-inicializacion-y-git.md`](docs/architecture/09-inicializacion-y-git.md) | Receta de inicialización (Fase 0). |
| [`docs/architecture/anexos/`](docs/architecture/anexos/) | Esquema Prisma, restricciones SQL y lógica de dominio probados. |

## Estructura

```
src/
├─ main.ts · app.module.ts · salud.controller.ts
├─ shared/        config, prisma, errores, auth, consecutivos, tiempo
└─ modules/       inventario (ejemplo completo) y un README por cada módulo pendiente
prisma/           schema.prisma, migrations/, sql/restricciones.sql, seed.ts
scripts/          crear-migracion-inicial.mjs
```
