# SIRA - Stack y operación

## 1. Stack

Se respeta el stack del documento base. Las versiones se actualizan a las estables vigentes en octubre de 2026.

| Capa | Tecnología | Versión | Por qué |
|---|---|---|---|
| Lenguaje | TypeScript | 5.x (front) · 6.x (back) | Un solo lenguaje en todo el proyecto. |
| Runtime | Node.js | 22 LTS | LTS vigente; lo exigen Next 16 y Nest 12. |
| Gestor de paquetes | pnpm (workspaces) | 10.x | Monorepo con un solo `install`. Más rápido y estricto que npm. |
| Frontend | Next.js (App Router) + React | 16.4 · 19 | ⚠️ El doc dice Next 15; la 16 es la estable actual y no cambia nada del diseño. |
| Estilos | Tailwind CSS | 4 | Tokens de la marca como variables CSS. |
| Calendario UI | FullCalendar | 6 | Mes, semana, día y línea de tiempo ya resueltos. ⚠️ La vista de línea de tiempo con recursos (RF-CAL-10) es de la edición premium de FullCalendar; para el avance se construye con la vista de semana o con un componente propio. |
| Backend | NestJS | 12 (ESM) | Módulos alineados al dominio, inyección de dependencias, Swagger integrado. |
| ORM | Prisma | 7.10 con `@prisma/adapter-pg` | Migraciones versionadas y tipos generados del esquema. |
| Base de datos | PostgreSQL | 16 | Rangos temporales y restricciones de exclusión. |
| Colas | Redis 7 + BullMQ | | Vencimientos, recordatorios, correos, PDF. |
| Archivos | MinIO (desarrollo) / S3 compatible (producción) | | Fotos, soportes, PDF. |
| Correo en desarrollo | Mailpit | | Captura los correos sin enviarlos de verdad. |
| Pruebas | Vitest (back), Playwright (e2e, fase posterior) | | Vitest viene por defecto en Nest 12. |
| Lint y formato | oxlint + Prettier (back), ESLint (front) | | Lo que trae cada generador. |
| Contenedores | Docker + Docker Compose | | Mismo entorno para los tres integrantes. |

### Notas para el equipo sobre las versiones nuevas

- **NestJS 12 usa módulos ES.** Los `import` de archivos propios llevan la extensión `.js` aunque el archivo sea `.ts`: `import { AppModule } from './app.module.js'`. Si se olvida, el error es `ERR_MODULE_NOT_FOUND`.
- **Prisma 7** ya no lleva la URL de la base en `schema.prisma` sino en `prisma.config.ts`, y el cliente se genera dentro de `src/generated/prisma` (no en `node_modules`). Se importa desde ahí.
- **Next.js 16** trae cambios de API. Antes de usar algo nuevo, leer la guía en `apps/frontend/node_modules/next/dist/docs/`. El archivo `AGENTS.md` del frontend se lo recuerda a cualquier agente de IA.

## 2. Entornos

| Entorno | Dónde | Datos |
|---|---|---|
| Desarrollo | La máquina de cada integrante, con `docker compose` para PostgreSQL, Redis, MinIO y Mailpit. | Seed con datos de prueba. |
| Demostración | ⚠️ Un servidor de la universidad o un VPS pequeño, para la entrega del avance. | Seed + datos reales de los bloques. |
| Producción | Servidor de la institución con Docker, Traefik y Dokploy (como propone el documento base). | Reales. |

### Puertos en desarrollo

| Servicio | Puerto | URL |
|---|---|---|
| Frontend | 3000 | http://localhost:3000 |
| Backend | 3001 | http://localhost:3001/api |
| Swagger | 3001 | http://localhost:3001/docs |
| PostgreSQL | 5432 | `postgresql://sira:sira@localhost:5432/sira` |
| Redis | 6379 | |
| MinIO API / consola | 9000 / 9001 | http://localhost:9001 (sira / sira-secreto) |
| Mailpit | 8025 | http://localhost:8025 |

## 3. Secretos y configuración

- Cada app tiene un `.env.example` versionado con **todas** las variables y valores de desarrollo. El `.env` real **nunca** se sube (está en `.gitignore`).
- El backend valida las variables al arrancar: si falta una obligatoria, no inicia y dice cuál.
- En producción los secretos van en las variables de entorno de Dokploy, nunca en el repositorio (RNF-18).
- Credenciales de pasarela de pruebas y de producción separadas y visibles (sin el valor) en el panel de configuración (sección 11.1).

## 4. Copias de seguridad

- Producción: `pg_dump` diario automático, retención de 30 días, y prueba de restauración trimestral documentada (RNF-14).
- El almacenamiento de archivos se respalda con la misma frecuencia.

## 5. Observabilidad

- Logs JSON con `correlacionId` por petición, retenidos 180 días (RNF-15).
- Endpoint `/api/salud` para el monitor de disponibilidad.
- ⚠️ Errores en producción: Sentry en su plan gratuito, o los logs del servidor si la universidad no permite servicios externos.

## 6. Pruebas

| Qué | Cómo | Cuándo es obligatorio |
|---|---|---|
| Reglas de negocio | Unitarias con Vitest sobre los servicios. Meta: > 70 % de cobertura en servicios de dominio (RNF-16). | Todo PR que toque un servicio. |
| Máquina de estados | Prueba de la tabla de transiciones completa. | Ya en el avance. |
| Concurrencia (RNF-05) | Prueba de integración contra PostgreSQL real: dos envíos simultáneos sobre la misma franja → exactamente uno prospera. | Ya en el avance. |
| API | Pruebas e2e con supertest de los flujos UC-01 a UC-03. | Antes de la entrega. |
| Interfaz | Revisión manual con Lighthouse/axe; Playwright después. | Antes de la entrega. |
| Carga (RNF-03) | k6. | Fase de cierre. |

## 7. Costos

| Concepto | Desarrollo | Producción |
|---|---|---|
| Software | $0 (todo es libre o gratuito) | $0 |
| Servidor | $0 (local) | ⚠️ Servidor de la universidad: $0. Si fuera un VPS: unos USD 10–20 al mes (2 vCPU, 4 GB). |
| Correo | $0 (Mailpit) | Cuenta de Google Workspace o Microsoft 365 institucional por SMTP: $0. |
| Pasarela | — | Sin mensualidad; comisión por transacción (aprox. 2,8–3,5 % tarjeta, 1,3–2 % PSE + IVA, cifras indicativas del documento base). |
| Factura electrónica | — | Según el proveedor tecnológico que ya use la institución. |
| FullCalendar premium (línea de tiempo) | — | Opcional; licencia anual. Se evita en la v1. |
