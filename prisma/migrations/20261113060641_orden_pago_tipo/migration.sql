-- CreateEnum
CREATE TYPE "TipoOrdenPago" AS ENUM ('TOTAL', 'ANTICIPO', 'SALDO');

-- AlterTable
ALTER TABLE "orden_pago" ADD COLUMN     "tipo" "TipoOrdenPago" NOT NULL DEFAULT 'TOTAL';

-- Parámetros iniciales; no sobrescribir configuración de una instalación existente.
INSERT INTO "parametro" ("clave", "valor", "descripcion", "actualizado_en") VALUES
('PORCENTAJE_ANTICIPO', '0'::jsonb, 'Porcentaje inicial (0 desactiva anticipos; hasta dos decimales).', CURRENT_TIMESTAMP),
('DIAS_SALDO_ANTES_EVENTO', '3'::jsonb, 'Días calendario entre vencimiento del saldo e inicio de la primera franja.', CURRENT_TIMESTAMP)
ON CONFLICT ("clave") DO NOTHING;
