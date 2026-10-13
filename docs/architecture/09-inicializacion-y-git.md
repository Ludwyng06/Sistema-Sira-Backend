# SIRA - Inicialización de los repositorios y Git

> Receta para el agente (Orca) que inicializa los repositorios. Se ejecuta **una sola vez**, en orden. Al terminar, el equipo clona, corre unos pocos comandos y ve el portal con datos.
> Versiones verificadas el 12 de octubre de 2026 al generar los proyectos con sus CLI oficiales.
> SIRA vive en **dos repositorios independientes** (no es un monorepo):
> - Backend: https://github.com/Ludwyng06/Sistema-Sira-Backend
> - Frontend: https://github.com/Ludwyng06/Sistema-Sira-Frontend

## Fase 0 · Resultado esperado

Repositorio **Backend** (NestJS 12 + Prisma 7), todo en la raíz del repositorio:

```
Sistema-Sira-Backend/
├─ .gitignore
├─ .nvmrc                       22
├─ README.md                    cómo arrancar (sección 8)
├─ PROMPT-MAESTRO.md
├─ package.json                 scripts del backend (incluye db:*)
├─ docker-compose.yml           PostgreSQL, Redis, MinIO y Mailpit
├─ prisma.config.ts
├─ prisma/                      schema.prisma, migrations/, sql/restricciones.sql, seed.ts
├─ scripts/                     crear-migracion-inicial.mjs
├─ src/                         main.ts, app.module.ts, shared/, modules/
└─ docs/architecture/           01 a 09 + anexos/   (FUENTE DE VERDAD)
```

Repositorio **Frontend** (Next.js 16 + Tailwind 4), todo en la raíz del repositorio:

```
Sistema-Sira-Frontend/
├─ .gitignore
├─ .nvmrc                       22
├─ README.md                    cómo arrancar (sección 8)
├─ PROMPT-MAESTRO.md
├─ package.json
├─ .env.example
├─ public/
├─ src/                         app/, components/, lib/
└─ docs/architecture/           copia de la documentación del Backend
```

**Criterio de terminado de la Fase 0:**
- [ ] **Backend:** `npm install && npm run db:up && npm run db:init && npm run db:seed && npm run dev` (o `npm run start`) funciona en una máquina limpia.
- [ ] **Backend:** `http://localhost:3001/docs` muestra Swagger con los endpoints de inventario y `/api/salud` responde `ok`.
- [ ] **Frontend:** con el backend arriba, `http://localhost:3000` muestra la sede Mocoa con los bloques A, B y C; al entrar a un bloque se ven sus espacios por piso con aforo; la ficha de un espacio muestra fotos (o un marcador), dotación y tarifas.
- [ ] **Backend:** `npm run build` y `npm run test` pasan (incluye los `.spec.ts` de los anexos).
- [ ] **Frontend:** `npm run build` y `npm run lint` pasan.
- [ ] Todo está en GitHub: base en `main`, `develop` creada desde `main`, y ambas protegidas.

## 1. Requisitos de la máquina

Node.js 22.22.3 o superior (22 LTS) · npm (viene con Node) · Docker Desktop · Git.

## 2. Repositorios

Cada aplicación tiene su propio repositorio, su propio `package.json` y su propio `.gitignore`. Se levantan por separado: backend en el puerto 3001 y frontend en el 3000.

```bash
# Backend (clon vacío de GitHub)
git clone https://github.com/Ludwyng06/Sistema-Sira-Backend.git && cd Sistema-Sira-Backend
# copiar aquí docs/ y PROMPT-MAESTRO.md entregados

# Frontend (clon vacío de GitHub)
git clone https://github.com/Ludwyng06/Sistema-Sira-Frontend.git && cd Sistema-Sira-Frontend
# copiar aquí la misma docs/ y PROMPT-MAESTRO.md
```

**Documentación.** La carpeta `docs/` y `PROMPT-MAESTRO.md` se copian en **ambos** repositorios. La copia del **Backend manda**: si cambia un documento, se cambia primero en el Backend y se copia al Frontend el mismo día.

`.gitignore` del **Backend**:

```gitignore
node_modules/
dist/
coverage/
*.log
.env
.env.local
!.env.example
src/generated/
.DS_Store
.idea/
.vscode/*
!.vscode/extensions.json
```

`.gitignore` del **Frontend**:

```gitignore
node_modules/
.next/
coverage/
*.log
.env
.env.local
!.env.example
.DS_Store
.idea/
.vscode/*
!.vscode/extensions.json
```

Cada repositorio lleva un `README.md` con los pasos para arrancarlo (sección 8) y un enlace al otro repositorio.

## 3. Docker Compose (servicios de desarrollo)

`docker-compose.yml` (vive en la raíz del **Backend**; el Frontend no tiene Docker):

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

En la raíz del repositorio Backend:

```bash
npx @nestjs/cli@12 new . --package-manager npm --skip-git --strict
```

> **Ojo, NestJS 12 cambió respecto a lo que suele conocer un agente:** el proyecto es **ESM** (`"type": "module"`), los imports relativos llevan extensión `.js` (`import { AppModule } from './app.module.js'`), las pruebas son con **Vitest** (no Jest), el lint es **oxlint** y TypeScript es 6.x. Borrar `app.controller.ts`, `app.service.ts`, sus specs y el `README.md` generado.

### 4.2 Dependencias

```bash
npm install @nestjs/config @nestjs/swagger @nestjs/jwt @nestjs/passport passport passport-jwt \
  @nestjs/throttler @nestjs/schedule @nestjs/bullmq bullmq class-validator class-transformer \
  argon2 helmet @prisma/client@7.10.0 @prisma/adapter-pg@7.10.0 pg
npm install -D prisma@7.10.0 @types/passport-jwt @types/pg tsx dotenv
```

> Usar **Prisma 7.10.0** fijo: la etiqueta `latest` de npm apunta hoy a una versión candidata (8.0.0-rc).

Scripts a agregar en el `package.json` del Backend:

```json
"start": "nest start",
"dev": "nest start --watch",
"start:prod": "node dist/main",
"db:up": "docker compose up -d",
"db:down": "docker compose down",
"db:init": "node scripts/crear-migracion-inicial.mjs",
"db:migrate": "prisma migrate deploy",
"db:nueva-migracion": "prisma migrate dev --create-only",
"db:seed": "prisma db seed",
"db:reset": "prisma migrate reset",
"postinstall": "prisma generate"
```

### 4.3 Prisma 7

Copiar `docs/architecture/anexos/schema.prisma` → `prisma/schema.prisma` y `anexos/restricciones.sql` → `prisma/sql/restricciones.sql`. **Sin modificarlos.**

En Prisma 7 la URL de la base **no** va en el esquema sino en `prisma.config.ts`:

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

Prisma no sabe crear la restricción de exclusión ni la columna generada `periodo`. Por eso la migración inicial se crea en dos pasos. `scripts/crear-migracion-inicial.mjs`:

```js
// Crea la migración inicial y le anexa prisma/sql/restricciones.sql.
// Se ejecuta UNA vez, por UNA persona; la migración resultante se sube a git.
import { execSync } from 'node:child_process';
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'prisma/migrations';
if (existsSync(dir) && readdirSync(dir).some((d) => !d.endsWith('.toml'))) {
  console.error('Ya existen migraciones. Usa `npm run db:migrate` para aplicarlas o `npm run db:nueva-migracion` para crear otra.');
  process.exit(1);
}
const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

run('npx prisma migrate dev --create-only --name init');
const carpeta = readdirSync(dir).find((d) => d.endsWith('_init'));
appendFileSync(
  join(dir, carpeta, 'migration.sql'),
  '\n\n-- ===== restricciones.sql (anexado por db:init) =====\n' +
    readFileSync('prisma/sql/restricciones.sql', 'utf8'),
);
// `migrate deploy` y no `migrate dev`: con la columna generada `periodo` Prisma detecta
// una diferencia permanente (ALTER ... DROP DEFAULT) y `migrate dev` pediría crear otra migración.
run('npx prisma migrate deploy');
console.log(`Migración ${carpeta} creada con las restricciones. Súbela a git.`);
```

Después de `npm run db:init`, verificar en `psql` que existe la restricción:
`SELECT conname FROM pg_constraint WHERE conname = 'sin_solapamiento';` → 1 fila.

**Por qué `db:migrate` es `prisma migrate deploy`:** con la columna generada `periodo`, Prisma detecta siempre una diferencia (`ALTER TABLE "franja_ocupada" ALTER COLUMN "periodo" DROP DEFAULT;`) que PostgreSQL no puede aplicar, y `prisma migrate dev` se quedaría esperando que le pongan nombre a una migración inútil. Por eso:

- `npm run db:migrate` **aplica** las migraciones existentes (`prisma migrate deploy`, sin preguntas). Es lo que usa quien clona.
- `npm run db:nueva-migracion -- --name descripcion` **crea** una migración nueva sin aplicarla (`prisma migrate dev --create-only`). Abrir el `migration.sql` generado y **borrar a mano** la sentencia `ALTER ... "periodo" DROP DEFAULT`; después aplicarla con `npm run db:migrate`.

**Regla para todas las migraciones siguientes:** revisar que el `migration.sql` que genera Prisma no toque `sin_solapamiento` ni `periodo` (salvo esa sentencia, que se borra). Si lo hace, volver a anexar `restricciones.sql` (es idempotente).

### 4.5 Variables de entorno

`.env.example` (se versiona) y una copia `.env` (no se versiona):

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

### 4.8 Seed (`prisma/seed.ts`)

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

En la raíz del repositorio Frontend:

```bash
npx create-next-app@16 . --ts --tailwind --eslint --app --src-dir \
  --import-alias "@/*" --use-npm --disable-git --turbopack --yes
npm install @fullcalendar/core@6.1.21 @fullcalendar/react@6.1.21 @fullcalendar/daygrid@6.1.21 \
  @fullcalendar/timegrid@6.1.21 @fullcalendar/interaction@6.1.21 lucide-react clsx
```

> **Ojo, Next.js 16:** el generador deja `cacheComponents: true` en `next.config.ts` y un `AGENTS.md` que exige leer `node_modules/next/dist/docs/` antes de escribir código, porque varias API cambiaron. Hacerle caso. Las páginas públicas consultan la API en el servidor; con `cacheComponents` los datos dinámicos van dentro de `<Suspense>` o en funciones con `'use cache'` según indique esa guía.

Scripts del frontend (puerto fijo 3000): `"start": "next dev --port 3000"` (servidor de desarrollo), `"build": "next build"`, `"start:prod": "next start --port 3000"` y `"lint"`. Sin archivos de workspace ni campo `packageManager`; se versiona `package-lock.json`. `.env.example` del frontend:

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

> La ruta del bloque es `/sedes/[sede]/bloques/[bloque]` (ej. `/sedes/MOC/bloques/A`) y no `/bloques/A`, porque el código del bloque solo es único dentro de una sede. `04` §3 ya refleja esta ruta.

## 6. Verificación antes del primer commit

Backend (en la raíz del repositorio Backend):

```bash
npm install
npm run db:up
npm run db:init          # crea prisma/migrations/<fecha>_init
npm run db:seed
npm run build
npm run test             # aforo.spec y maquina-estados.spec deben pasar
npm run dev              # (o npm run start) http://localhost:3001/docs y /api/salud
```

Frontend (en la raíz del repositorio Frontend, con el backend arriba):

```bash
npm install
npm run build
npm run lint
npm run start            # http://localhost:3000 — revisar los criterios de la Fase 0
```

## 7. Git y GitHub

Flujo de ramas: `main` + `develop`. El primer commit de la base de cada repositorio va a `main`; `develop` nace de `main`.

```bash
# En cada repositorio (Backend y Frontend)
git add .
git commit -m "chore: base inicial de SIRA y documentación"
git push -u origin main
git switch -c develop
git push -u origin develop
```

Después, en GitHub, en **cada** repositorio (lo hace Jensen):

1. **Settings → Collaborators:** invitar a Isabel Cerón y Kevin Guerrero.
2. **Settings → Branches:** dejar `develop` como rama por defecto.
3. **Settings → Branches → Add rule** para `main` **y** para `develop`: exigir pull request con 1 aprobación y que la rama esté al día.
4. Crear las etiquetas `backend`, `frontend`, `base-de-datos`, `documentacion`, `bug`.
5. Crear un *issue* por cada fila de los días de `08-plan-de-trabajo-20-dias.md`, asignado a su responsable y en el repositorio que corresponda (Orca puede hacerlo con `gh issue create`).

Convenciones (detalle en `08` §2):
- Nadie trabaja directo en `main` ni en `develop`. Las ramas de trabajo salen de `develop`: `feat/<modulo>-<tarea>`, `fix/...`, `docs/...`.
- El pull request va hacia `develop`. `develop` → `main` solo para entregas (por ejemplo, la demo del 1 de noviembre) y también por pull request.
- Commits en español con Conventional Commits: `feat: carga de fotos de espacios`.
- PR pequeño (máximo dos días de vida), con la descripción de qué cambia y cómo probarlo.
- Solo una persona a la vez cambia `schema.prisma`, y avisa en el grupo.
- Un cambio de documentación se hace primero en `docs/` del Backend y se copia al Frontend el mismo día.
- Opcional: GitHub Actions con `npm install && npm run build && npm run test` en cada PR (en el Frontend, `npm run lint` en lugar de `npm run test`).

## 8. README de cada repositorio (contenido mínimo)

1. Qué es SIRA (dos líneas), enlace a `docs/architecture/01-project-vision.md` y enlace al **otro** repositorio.
2. Requisitos (sección 1).
3. Arranque.

   Backend:
   ```bash
   npm install
   cp .env.example .env
   npm run db:up
   npm run db:init      # solo quien crea el repositorio; los demás usan: npm run db:migrate
   npm run db:seed
   npm run dev          # o npm run start
   ```

   Frontend (con el backend arriba):
   ```bash
   npm install
   cp .env.example .env.local
   npm run start
   ```

4. URLs y puertos (`05` §2) y usuarios de prueba (sección 4.8).
5. Mapa de la documentación y enlace al plan de trabajo; indicar que la copia de `docs/` del Backend es la fuente de verdad.
