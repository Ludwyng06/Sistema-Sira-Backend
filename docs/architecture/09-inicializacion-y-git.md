# SIRA - Inicialización del proyecto y Git

> Receta para el agente (Orca) que inicializa el repositorio. Se ejecuta **una sola vez**, en orden. Al terminar, el equipo clona, corre cuatro comandos y ve el portal con datos.
> Versiones verificadas el 12 de octubre de 2026 al generar los proyectos con sus CLI oficiales.

## Fase 0 · Resultado esperado

```
sira/
├─ .gitignore
├─ .nvmrc                       22
├─ README.md                    cómo arrancar (pasos de la sección 8)
├─ PROMPT-MAESTRO.md
├─ package.json                 scripts de la raíz
├─ pnpm-workspace.yaml
├─ docker-compose.yml
├─ docs/architecture/           01 a 09 + anexos/
└─ apps/
   ├─ backend/                  NestJS 12 + Prisma 7
   └─ frontend/                 Next.js 16 + Tailwind 4
```

**Criterio de terminado de la Fase 0:**
- [ ] `pnpm install && pnpm db:up && pnpm db:init && pnpm db:seed && pnpm dev` funciona en una máquina limpia.
- [ ] `http://localhost:3001/docs` muestra Swagger con los endpoints de inventario y `/api/salud` responde `ok`.
- [ ] `http://localhost:3000` muestra la sede Mocoa con los bloques A, B y C; al entrar a un bloque se ven sus espacios por piso con aforo; la ficha de un espacio muestra fotos (o un marcador), dotación y tarifas.
- [ ] `pnpm build` y `pnpm test` pasan (incluye los `.spec.ts` de los anexos).
- [ ] Todo está en GitHub en `main`, con `main` protegida.

## 1. Requisitos de la máquina

Node.js 22 LTS · pnpm 10 (`corepack enable && corepack prepare pnpm@10 --activate`) · Docker Desktop · Git.

## 2. Monorepo

```bash
mkdir sira && cd sira && git init -b main
mkdir -p apps docs
# copiar aquí la carpeta docs/ y PROMPT-MAESTRO.md entregados
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - apps/*

onlyBuiltDependencies:
  - '@nestjs/core'
  - '@prisma/engines'
  - prisma
  - argon2
  - sharp
  - unrs-resolver
  - esbuild
```

`package.json` de la raíz:

```json
{
  "name": "sira",
  "private": true,
  "packageManager": "pnpm@10.28.0",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "pnpm -r --parallel --filter backend --filter frontend run dev",
    "build": "pnpm -r run build",
    "lint": "pnpm -r run lint",
    "test": "pnpm -r run test",
    "db:up": "docker compose up -d",
    "db:down": "docker compose down",
    "db:init": "pnpm --filter backend db:init",
    "db:migrate": "pnpm --filter backend db:migrate",
    "db:seed": "pnpm --filter backend db:seed",
    "db:reset": "pnpm --filter backend db:reset"
  }
}
```

`.gitignore` de la raíz:

```gitignore
node_modules/
dist/
.next/
coverage/
*.log
.env
.env.local
!.env.example
apps/backend/src/generated/
.DS_Store
.idea/
.vscode/*
!.vscode/extensions.json
```

## 3. Docker Compose (servicios de desarrollo)

`docker-compose.yml`:

```yaml
name: sira

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: sira
      POSTGRES_PASSWORD: sira
      POSTGRES_DB: sira
      TZ: UTC
    ports: ['5432:5432']
    volumes: ['pg_data:/var/lib/postgresql/data']
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U sira']
      interval: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    ports: ['6379:6379']

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: sira
      MINIO_ROOT_PASSWORD: sira-secreto
    ports: ['9000:9000', '9001:9001']
    volumes: ['minio_data:/data']

  # Crea el bucket "sira" con lectura pública de las fotos.
  minio-init:
    image: minio/mc:latest
    depends_on: [minio]
    entrypoint: >
      /bin/sh -c "
      until mc alias set local http://minio:9000 sira sira-secreto; do sleep 1; done;
      mc mb -p local/sira && mc anonymous set download local/sira/publico; exit 0"

  mailpit:
    image: axllent/mailpit:latest
    ports: ['1025:1025', '8025:8025']

volumes:
  pg_data:
  minio_data:
```

## 4. Backend

### 4.1 Generar

```bash
cd apps
npx @nestjs/cli@12 new backend --package-manager pnpm --skip-git --strict
```

> **Ojo, NestJS 12 cambió respecto a lo que suele conocer un agente:** el proyecto es **ESM** (`"type": "module"`), los imports relativos llevan extensión `.js` (`import { AppModule } from './app.module.js'`), las pruebas son con **Vitest** (no Jest), el lint es **oxlint** y TypeScript es 6.x. Borrar `app.controller.ts`, `app.service.ts`, sus specs y el `README.md` generado.

### 4.2 Dependencias

```bash
cd backend
pnpm add @nestjs/config @nestjs/swagger @nestjs/jwt @nestjs/passport passport passport-jwt \
  @nestjs/throttler @nestjs/schedule @nestjs/bullmq bullmq class-validator class-transformer \
  argon2 helmet @prisma/client@7.10.0 @prisma/adapter-pg@7.10.0 pg
pnpm add -D prisma@7.10.0 @types/passport-jwt @types/pg tsx dotenv
```

> Usar **Prisma 7.10.0** fijo: la etiqueta `latest` de npm apunta hoy a una versión candidata (8.0.0-rc).

Scripts a agregar en `apps/backend/package.json`:

```json
"dev": "nest start --watch",
"db:init": "node scripts/crear-migracion-inicial.mjs",
"db:migrate": "prisma migrate dev",
"db:seed": "prisma db seed",
"db:reset": "prisma migrate reset",
"postinstall": "prisma generate"
```

### 4.3 Prisma 7

Copiar `docs/architecture/anexos/schema.prisma` → `apps/backend/prisma/schema.prisma` y `anexos/restricciones.sql` → `apps/backend/prisma/sql/restricciones.sql`. **Sin modificarlos.**

En Prisma 7 la URL de la base **no** va en el esquema sino en `apps/backend/prisma.config.ts`:

```ts
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  datasource: { url: env('DATABASE_URL') },
});
```

El esquema usa `generator client { provider = "prisma-client", output = "../src/generated/prisma", moduleFormat = "esm" }`: el cliente se importa desde `src/generated/prisma/client.js`, **no** desde `@prisma/client`. El `PrismaService` lo instancia con el adaptador:

```ts
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';

super({ adapter: new PrismaPg({ connectionString: config.get('DATABASE_URL') }) });
```

### 4.4 Migración inicial con las restricciones SQL

Prisma no sabe crear la restricción de exclusión ni la columna generada `periodo`. Por eso la migración inicial se crea en dos pasos. `apps/backend/scripts/crear-migracion-inicial.mjs`:

```js
// Crea la migración inicial y le anexa prisma/sql/restricciones.sql.
// Se ejecuta UNA vez, por UNA persona; la migración resultante se sube a git.
import { execSync } from 'node:child_process';
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'prisma/migrations';
if (existsSync(dir) && readdirSync(dir).some((d) => !d.endsWith('.toml'))) {
  console.error('Ya existen migraciones. Usa `pnpm db:migrate` para las siguientes.');
  process.exit(1);
}
const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

run('pnpm prisma migrate dev --create-only --name init');
const carpeta = readdirSync(dir).find((d) => d.endsWith('_init'));
appendFileSync(
  join(dir, carpeta, 'migration.sql'),
  '\n\n-- ===== restricciones.sql (anexado por db:init) =====\n' +
    readFileSync('prisma/sql/restricciones.sql', 'utf8'),
);
run('pnpm prisma migrate dev');
console.log(`Migración ${carpeta} creada con las restricciones. Súbela a git.`);
```

Después de `pnpm db:init`, verificar en `psql` que existe la restricción:
`SELECT conname FROM pg_constraint WHERE conname = 'sin_solapamiento';` → 1 fila.

**Regla para todas las migraciones siguientes:** revisar que el `migration.sql` que genera Prisma no toque `sin_solapamiento` ni `periodo`. Si lo hace, volver a anexar `restricciones.sql` (es idempotente).

### 4.5 Variables de entorno

`apps/backend/.env.example` (se versiona) y una copia `.env` (no se versiona):

```dotenv
NODE_ENV=development
PORT=3001
TZ=UTC
FRONTEND_URL=http://localhost:3000
DATABASE_URL="postgresql://sira:sira@localhost:5432/sira?schema=public"
JWT_ACCESS_SECRETO=cambia-esto-en-produccion-access
JWT_ACCESS_EXPIRA=15m
JWT_REFRESH_SECRETO=cambia-esto-en-produccion-refresh
JWT_REFRESH_DIAS=7
REDIS_URL=redis://localhost:6379
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=sira
S3_ACCESS_KEY=sira
S3_SECRET_KEY=sira-secreto
S3_URL_PUBLICA=http://localhost:9000/sira
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USUARIO=
SMTP_CONTRASENA=
CORREO_REMITENTE="SIRA Uniputumayo <no-responder@uniputumayo.edu.co>"
```

### 4.6 Base compartida (`src/shared/`)

| Archivo | Qué hace |
|---|---|
| `config/configuracion.ts` | Función `validarConfiguracion` para `ConfigModule.forRoot({ validate })`. Falla al arrancar si falta una variable; en producción rechaza secretos JWT de menos de 32 caracteres. |
| `prisma/prisma.service.ts` + `prisma.module.ts` | Cliente único con el adaptador pg, módulo `@Global`. |
| `errores/error-dominio.ts` | `class ErrorDominio(codigo, mensaje, status = 422, detalles?)` y `noEncontrado(recurso)` (404). |
| `errores/filtro-errores.ts` | `@Catch()` global: traduce `ErrorDominio`, el error PostgreSQL `23P01` / `sin_solapamiento` → `409 FRANJA_NO_DISPONIBLE`, Prisma `P2002` → 409, `P2025` → 404, errores de validación → `400 DATOS_INVALIDOS` con la lista de campos. Forma: `{ codigo, mensaje, detalles?, correlacionId }`. Nunca expone stack traces. |
| `auth/decoradores.ts` | `@Publico()`, `@Roles(...roles)`, `@UsuarioActual()`, interfaz `UsuarioAutenticado { id, correo, roles, dependencias, correoVerificado, esInstitucional }`. |
| `auth/jwt.strategy.ts` | passport-jwt con `Bearer`; la carga es `{ sub, correo, roles, dependencias, verificado, institucional }`. |
| `auth/guardas.ts` | `JwtAuthGuard` (todo exige sesión salvo `@Publico`) y `RolesGuard`, registrados como `APP_GUARD` en ese orden. |
| `consecutivos/consecutivo.service.ts` | `siguiente(tx, tipo)` con `INSERT … ON CONFLICT DO UPDATE SET ultimo = ultimo + 1 RETURNING ultimo` dentro de la transacción. Formatos: `SOL-2026-0001`, `COT-2026-0001`, `OP-2026-000001`, `ACT-2026-0001`. Año según Bogotá. |
| `tiempo/zona-horaria.ts` | `fechaLocal`, `diaSemanaLocal`, `diasHabilesEntre(desde, hasta, festivos)` usando `Intl` con `America/Bogota`. |

`main.ts`: prefijo `api`, Helmet, CORS solo a `FRONTEND_URL` con credenciales, middleware que asigna `x-correlation-id`, `ValidationPipe({ whitelist, forbidNonWhitelisted, transform })`, Swagger en `/docs` con Bearer. `app.module.ts`: `ConfigModule` global, `ThrottlerModule` (100/min) con `ThrottlerGuard` global, `FiltroErrores` como `APP_FILTER`, `SaludController` (`GET /api/salud` hace `SELECT 1`).

### 4.7 Módulo de ejemplo: `inventario`

Es la plantilla que copian los demás módulos. Copiar `anexos/aforo.ts` y su spec a `modules/inventario/dominio/`.

| Archivo | Contenido |
|---|---|
| `controllers/inventario-publico.controller.ts` | `@Publico()`. `GET /sedes` · `GET /sedes/:sede/bloques` · `GET /sedes/:sede/bloques/:bloque?asistentes=` · `GET /espacios` (filtros) · `GET /espacios/:codigo` · `GET /tipos-espacio`. Códigos en mayúsculas. |
| `controllers/espacios-admin.controller.ts` | `@Roles('ADMINISTRADOR')`. `POST /espacios` y `PATCH /espacios/:codigo/archivar` (204). |
| `dto/filtros-espacios.dto.ts` | `sede`, `bloque`, `tipo`, `asistentes`, `pagina=1`, `porPagina=24` (máx. 100), con `@Type(() => Number)`. |
| `dto/crear-espacio.dto.ts` | `codigo` con patrón `^[A-Z0-9]+(-[A-Z0-9]+)*$`, `capacidadPersonas ≥ 1`, etc. |
| `services/inventario-publico.service.ts` | Ver reglas abajo. |
| `services/espacios-admin.service.ts` | Crear: valida bloque, tipo, que el piso exista en el bloque y código no repetido (409). Archivar: rechaza si tiene franjas de reserva futuras `RETENIDA`/`CONFIRMADA` (409). |

Reglas del servicio público:
- **Filtro de visibilidad** (RN-16): `archivadoEn = null`, `esReservable`, `estado ≠ FUERA_DE_SERVICIO`, bloque y sede activos.
- **Nunca** devuelve responsable ni datos de solicitantes.
- **Tarjeta de espacio:** `codigo, nombre, piso, capacidadPersonas, tipo, bloque, sede, portada {url, alt} | null, dotacion` (hasta 4 elementos en servicio con cantidad), `tarifaDesde` (menor tarifa externa vigente, nunca la interna) y `aforo` si se pidió con `asistentes` (de `evaluarAforo`).
- **Bloques de una sede:** cada uno con `totalEspacios`, `capacidadMaxima`, `conteoPorTipo` y una foto.
- **Detalle del bloque:** `planoUrl`, tipos presentes y `pisos: [{ piso, espacios: Tarjeta[] }]`.
- **Búsqueda con `asistentes`:** oculta los que no caben y ordena con `ordenarPorAjuste`.
- Paginación `{ datos, total, pagina, porPagina }`.

Las demás carpetas de `modules/` se crean vacías, cada una con un `README.md` de una línea que copie su fila de la tabla de `03-backend.md` §1 y el responsable según `08`.

### 4.8 Seed (`apps/backend/prisma/seed.ts`)

Idempotente (`upsert` por código o correo). Todo dato de ejemplo se marca en la descripción con "(dato de ejemplo)" hasta tener los planos reales.

| Qué | Datos |
|---|---|
| `Parametro` | Los de `02-data-model.md` §3.6, más `cuenta_recaudo` = `{ banco: "(por definir)", tipo: "Ahorros", numero: "(por definir)", titular: "Institución Universitaria del Putumayo", nit: "800.247.940-1" }`. |
| `Sede` | `MOC` · Mocoa (Sede principal "Aire Libre", barrio Luis Carlos Galán). Sibundoy y extensiones se crean después. |
| `Bloque` | `A`, `B`, `C` de Mocoa (pisos de ejemplo: 3, 2, 2). |
| `TipoEspacio` | `AULA` (2 días hábiles) · `SALA_INFORMATICA` (2) · `LABORATORIO` (3) · `AUDITORIO` (2, póliza desde 150 personas) · `ESCENARIO_DEPORTIVO` (2, póliza desde 150) · `SALA_JUNTAS` (2) · `ZONA_VERDE` (3). |
| `Dependencia` | Vicerrectoría Administrativa (jefe = usuario aprobador), Biblioteca, Facultad de Ingeniería, Bienestar Institucional, Oficina de Sistemas. |
| `Espacio` (ejemplo) | A-101 Aula 40 · A-102 Aula 40 · A-201 Aula 35 · A-202 Sala de informática 30 · A-301 Sala de juntas 12 · B-101 Auditorio Mayor 300 (montaje 120 min, desmontaje 60, depósito 20 %) · B-102 Laboratorio de Redes 25 · B-201 Laboratorio de Química 20 · B-202 Aula audiovisual 50 · C-101 Cancha múltiple 200 · C-102 Sala de informática 35 · C-201 Aula 45. Responsable del auditorio = usuario responsable. |
| `Elemento` | Dotación de ejemplo: videobeam, tablero, sillas universitarias, computadores, switches, sonido del auditorio. |
| `Tarifa` | Por hora para `PERSONA_NATURAL`, `EMPRESA`, `ENTIDAD` (valores de prueba) e `INTERNO` en $0, vigencia desde 2026-01-01, `acuerdoSoporte = "VALORES DE PRUEBA - pendiente acuerdo de tarifas"`. |
| `Recargo` | Nocturno 20 % desde 18:00, dominical 25 %, festivo 25 % (de prueba). |
| `Festivo` | Colombia 2026: 1 ene, 12 ene, 23 mar, 2 abr, 3 abr, 1 may, 18 may, 8 jun, 15 jun, 29 jun, 20 jul, 7 ago, 17 ago, 12 oct, 2 nov, 16 nov, 8 dic, 25 dic. |
| `Smmlv` | 2026 ⚠️ verificar el valor oficial del decreto antes de usarlo. |
| `BloqueoCalendario` + `FranjaOcupada` | Una clase recurrente en A-101 los lunes de 7:00 a 9:00 por 8 semanas (franjas `BLOQUEO`, origen `CLASE`) y un mantenimiento en B-102. Sirven para ver el calendario con datos. |
| `Proveedor` + `ServicioComplementario` | Grupo de danzas y coro (internos, por presentación), sonido y videobeam (por hora), refrigerio (externo, por persona, 10 % de administración). |
| Usuarios de prueba | Contraseña `Sira2026*` (Argon2id), todos verificados: `admin@itp.edu.co` (ADMINISTRADOR) · `vicerrectoria@itp.edu.co` (APROBADOR, jefe de Vicerrectoría) · `auditorio@itp.edu.co` (responsable del B-101) · `tesoreria@itp.edu.co` (TESORERIA) · `control.interno@itp.edu.co` (AUDITOR) · `docente@itp.edu.co` (SOLICITANTE interno, Facultad de Ingeniería) · `empresa@ejemplo.com` (SOLICITANTE empresa con NIT) · `persona@ejemplo.com` (SOLICITANTE persona natural). |

## 5. Frontend

### 5.1 Generar

```bash
cd apps
npx create-next-app@16 frontend --ts --tailwind --eslint --app --src-dir \
  --import-alias "@/*" --use-pnpm --skip-install --disable-git --turbopack --yes
rm frontend/pnpm-workspace.yaml   # el workspace lo maneja la raíz
cd frontend
pnpm add @fullcalendar/core @fullcalendar/react @fullcalendar/daygrid \
  @fullcalendar/timegrid @fullcalendar/interaction lucide-react clsx
```

> **Ojo, Next.js 16:** el generador deja `cacheComponents: true` en `next.config.ts` y un `AGENTS.md` que exige leer `node_modules/next/dist/docs/` antes de escribir código, porque varias API cambiaron. Hacerle caso. Las páginas públicas consultan la API en el servidor; con `cacheComponents` los datos dinámicos van dentro de `<Suspense>` o en funciones con `'use cache'` según indique esa guía.

Script `dev` con puerto fijo: `"dev": "next dev --port 3000"`. `.env.example` del frontend:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:3001/api
API_URL_INTERNA=http://localhost:3001/api
```

### 5.2 Base

| Pieza | Contenido |
|---|---|
| `src/app/globals.css` | Tokens de `04-frontend.md` §2 (`--color-azul #18668F`, `--color-azul-oscuro #0F4A69`, `--color-naranja #F5A51D`, `--color-verde #80BF1F`, `--color-gris #595957`, `--color-gris-claro #B2B6B9`, texto `#222`) expuestos a Tailwind con `@theme`. Foco visible con el azul. |
| `src/app/layout.tsx` | `lang="es"`, Raleway (títulos) y Roboto (texto) con `next/font/google`, metadata "SIRA · Uniputumayo". |
| `src/lib/api.ts` | Cliente único: URL base, `Authorization`, refresco ante `401`, convierte errores `{ codigo, mensaje }` en una clase `ErrorApi`. |
| `src/lib/formato.ts` | `pesos(1250000) → "$1.250.000"`, `fecha(iso) → "02/11/2026"`, `hora(iso) → "2:00 p. m."`, siempre con `timeZone: 'America/Bogota'`. |
| `src/lib/tipos.ts` | Tipos de las respuestas del inventario (tarjeta, bloque, ficha). |
| `public/marca/` | Logo de Uniputumayo (azul y blanco). ⚠️ Pedir el SVG a Comunicaciones; mientras tanto, nombre en texto con Raleway. |
| Componentes | `EncabezadoInstitucional`, `PieInstitucional` (con "VIGILADA MINEDUCACIÓN"), `TarjetaBloque`, `TarjetaEspacio`, `IndicadorAforo`, `EstadoVacio`, `EstadoError`. |
| Páginas `(publico)` | `/` (bloques de Mocoa + buscador por número de personas), `/sedes/[sede]/bloques/[bloque]` (plano + espacios por piso + filtro por tipo), `/espacios/[codigo]` (ficha). Cada una con `loading.tsx` y `error.tsx`. |
| Páginas de lugar | `(auth)/ingresar`, `(cuenta)/mis-solicitudes`, `(panel)/panel`, cada una con "En construcción · responsable: X" según `08`, para que el mapa de rutas exista desde el día 1. |

> La ruta del bloque es `/sedes/[sede]/bloques/[bloque]` (ej. `/sedes/MOC/bloques/A`) y no `/bloques/A` como dice `04` §3, porque el código del bloque solo es único dentro de una sede. Actualizar `04` en el mismo PR.

## 6. Verificación antes del primer commit

```bash
pnpm install
pnpm db:up
pnpm db:init          # crea apps/backend/prisma/migrations/<fecha>_init
pnpm db:seed
pnpm build
pnpm test             # aforo.spec y maquina-estados.spec deben pasar
pnpm dev              # revisar los criterios de la Fase 0
```

## 7. Git y GitHub

```bash
git add .
git commit -m "chore: base del monorepo SIRA (backend, frontend, docker, esquema y documentación)"
gh repo create <usuario-u-organizacion>/sira --private --source . --push
gh repo edit --add-topic nestjs,nextjs,postgresql,prisma
```

Después, en GitHub (lo hace Jensen):

1. **Settings → Collaborators:** invitar a Isabel Cerón y Kevin Guerrero.
2. **Settings → Branches → Add rule** para `main`: exigir pull request con 1 aprobación y que la rama esté al día.
3. Crear las etiquetas `backend`, `frontend`, `base-de-datos`, `documentacion`, `bug`.
4. Crear un *issue* por cada fila de los días de `08-plan-de-trabajo-20-dias.md`, asignado a su responsable (Orca puede hacerlo con `gh issue create`).

Convenciones (detalle en `08` §2):
- Ramas `feat/<modulo>-<tarea>`, `fix/...`, `docs/...`. Nunca se trabaja directo en `main`.
- Commits en español con Conventional Commits: `feat: carga de fotos de espacios`.
- PR pequeño (máximo dos días de vida), con la descripción de qué cambia y cómo probarlo.
- Solo una persona a la vez cambia `schema.prisma`, y avisa en el grupo.
- Opcional: GitHub Actions con `pnpm install && pnpm build && pnpm test` en cada PR.

## 8. README de la raíz (contenido mínimo)

1. Qué es SIRA (dos líneas) y enlace a `docs/architecture/01-project-vision.md`.
2. Requisitos (sección 1).
3. Arranque:
   ```bash
   pnpm install
   cp apps/backend/.env.example apps/backend/.env
   cp apps/frontend/.env.example apps/frontend/.env.local
   pnpm db:up && pnpm db:migrate && pnpm db:seed
   pnpm dev
   ```
   (Los integrantes que clonan usan `db:migrate`, que aplica la migración ya subida; `db:init` es solo para quien crea el repositorio).
4. URLs y puertos (`05` §2) y usuarios de prueba (sección 4.8).
5. Mapa de la documentación y enlace al plan de trabajo.
