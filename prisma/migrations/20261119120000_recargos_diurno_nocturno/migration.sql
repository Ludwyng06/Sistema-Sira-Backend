-- Recargos diurno/nocturno (2026-11-19).
-- DOMINICAL pasa a DOMINICAL_DIURNO y FESTIVO a FESTIVO_DIURNO conservando porcentaje y estado;
-- se crean DOMINICAL_NOCTURNO y FESTIVO_NOCTURNO con el mismo porcentaje del diurno correspondiente.
-- Las nocturnas dominical y festiva usan la hora "desde" del recargo NOCTURNO (desde_hora queda NULL).
-- Postgres no permite quitar valores de un enum: se crea el tipo nuevo, se migra la columna y se
-- reemplaza el viejo. Todo en una sola transacción (Prisma la abre por migración).

-- CreateEnum
CREATE TYPE "TipoRecargo_nuevo" AS ENUM (
  'NOCTURNO',
  'DOMINICAL_DIURNO',
  'DOMINICAL_NOCTURNO',
  'FESTIVO_DIURNO',
  'FESTIVO_NOCTURNO'
);

-- AlterTable: convierte los valores existentes al tipo nuevo.
ALTER TABLE "recargo"
  ALTER COLUMN "tipo" TYPE "TipoRecargo_nuevo"
  USING (
    CASE "tipo"::text
      WHEN 'DOMINICAL' THEN 'DOMINICAL_DIURNO'
      WHEN 'FESTIVO' THEN 'FESTIVO_DIURNO'
      ELSE "tipo"::text
    END
  )::"TipoRecargo_nuevo";

-- Reemplaza el enum viejo.
DROP TYPE "TipoRecargo";
ALTER TYPE "TipoRecargo_nuevo" RENAME TO "TipoRecargo";

-- Nocturnas dominical y festiva con el porcentaje y estado del diurno correspondiente.
INSERT INTO "recargo" ("id", "tipo", "porcentaje", "desde_hora", "activo")
SELECT gen_random_uuid(), 'DOMINICAL_NOCTURNO'::"TipoRecargo", "porcentaje", NULL, "activo"
FROM "recargo" WHERE "tipo" = 'DOMINICAL_DIURNO'
ON CONFLICT ("tipo") DO NOTHING;

INSERT INTO "recargo" ("id", "tipo", "porcentaje", "desde_hora", "activo")
SELECT gen_random_uuid(), 'FESTIVO_NOCTURNO'::"TipoRecargo", "porcentaje", NULL, "activo"
FROM "recargo" WHERE "tipo" = 'FESTIVO_DIURNO'
ON CONFLICT ("tipo") DO NOTHING;
