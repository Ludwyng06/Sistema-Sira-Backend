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
