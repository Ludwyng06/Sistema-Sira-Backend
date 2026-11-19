# SIRA · Backend

**SIRA** (Sistema de Inventario y Reserva de Activos) es la plataforma web con la que la Institución Universitaria del Putumayo administra sus espacios físicos por **sede → bloque → espacio**, publica su disponibilidad y tramita reservas (sin costo para uso institucional y con cotización y pago para externos). Este repositorio contiene la API y servicios del **backend** desarrollados con NestJS 12, Prisma 7 y PostgreSQL 16.

- Repositorio del frontend: <https://github.com/Ludwyng06/Sistema-Sira-Frontend>

## Requisitos

- **Node.js 22.22.3 o superior** (rama 22 LTS). Con un Node 22 más viejo, `npm run build`, `npm run start` y `npm run dev` fallan con `ERR_REQUIRE_CYCLE_MODULE` (la CLI de NestJS 12 usa `@angular-devkit` 22, que exige esa versión). `.nvmrc` apunta a `22`.
- npm (el que trae Node).
- Docker Desktop.
- Git.

## Instalación y arranque

```bash
npm install
cp .env.example .env
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev          # o npm run start
```

> Este repositorio ya trae la migración inicial en `prisma/migrations/`. Quien lo clona usa `npm run db:migrate`.

## Variables de entorno

Copia el archivo de plantilla `.env.example` a `.env` y configura los valores requeridos:
- `PORT`: Puerto de escucha del backend (por defecto `3001`).
- `DATABASE_URL`: Cadena de conexión a PostgreSQL (`postgresql://sira:sira@localhost:5432/sira?schema=public`).
- `REDIS_URL`: URL del servidor Redis para colas y caché (`redis://localhost:6379`).
- `JWT_ACCESS_SECRETO` y `JWT_REFRESH_SECRETO`: Claves para tokens JWT de autenticación.
- `FRONTEND_URL`: URL del frontend permitido en CORS (`http://localhost:3000`).
- `SMTP_HOST`, `SMTP_PORT`, `CORREO_REMITENTE`: Credenciales y remitente de correo saliente (Mailpit en desarrollo en puerto 1025).
- `PASARELA_PROVEEDOR`: Modalidad de pago (`ninguna` para recaudo institucional con verificación manual).

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor con recarga (puerto 3001). |
| `npm run start` / `npm run start:prod` | Servidor / servidor ya compilado (`dist/`). |
| `npm run build` · `npm run test` · `npm run lint` | Compilar, pruebas (Vitest) y lint (oxlint). |
| `npm run db:up` / `db:down` | Levanta / apaga PostgreSQL, Redis y Mailpit con Docker. |
| `npm run db:init` | Crea la migración inicial y le anexa `prisma/sql/restricciones.sql` (solo la primera vez). |
| `npm run db:migrate` | Aplica las migraciones existentes (`prisma migrate deploy`). |
| `npm run db:nueva-migracion -- --name <descripcion>` | Crea una migración nueva sin aplicarla. |
| `npm run db:seed` | Datos de ejemplo (idempotente). |
| `npm run db:reset` | Borra y recrea la base (pide confirmación). |

### MinIO (opcional)

Las imágenes `minio/minio` y `minio/mc` ya no se publican en Docker Hub, así que los servicios de almacenamiento del `docker-compose.yml` están bajo el perfil `almacenamiento` y **no** se levantan con `npm run db:up`.

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

## Migraciones

Con la columna generada `periodo` de `franja_ocupada`, Prisma detecta siempre una diferencia (`ALTER TABLE "franja_ocupada" ALTER COLUMN "periodo" DROP DEFAULT;`) que PostgreSQL no puede aplicar. Por eso:

- **Aplicar** las migraciones existentes: `npm run db:migrate` (usa `prisma migrate deploy`, sin preguntas).
- **Crear** una migración nueva: `npm run db:nueva-migracion -- --name descripcion`. Abre el `migration.sql` generado y **borra a mano** la sentencia `ALTER ... "periodo" DROP DEFAULT`; luego aplícala con `npm run db:migrate`.
- Revisa que el SQL generado no toque `sin_solapamiento` ni `periodo`. Si lo hace, vuelve a anexar `prisma/sql/restricciones.sql` (es idempotente).
- Solo una persona a la vez cambia `prisma/schema.prisma`, y avisa en el grupo.

## Pagos

SIRA opera bajo el modelo oficial de pago por enlace con verificación manual, con las pasarelas apagadas (`PASARELA_PROVEEDOR=ninguna`).
La orden de pago expone el valor y la referencia (`OP-`), permitiendo al solicitante realizar el pago mediante el enlace institucional, adjuntar su comprobante en PDF o imagen y notificar a Tesorería vía WhatsApp o correo.
Los parámetros institucionales `PAGO_ENLACE_URL`, `PAGO_INSTRUCCIONES`, `PAGO_WHATSAPP_AREA` y `PAGO_CORREO_AREA` son editables por el administrador para configurar el portal de recaudo y los canales oficiales de atención.

## Estructura

```
src/
├─ main.ts · app.module.ts · salud.controller.ts
├─ shared/        config, prisma, errores, auth, consecutivos, tiempo
├─ modules/       inventario, reservas, disponibilidad, pagos, identidad, etc.
prisma/           schema.prisma, migrations/, sql/restricciones.sql, seed.ts
scripts/          crear-migracion-inicial.mjs
```
