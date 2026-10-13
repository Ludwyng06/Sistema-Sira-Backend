-- =============================================================================
-- SIRA · Restricciones que Prisma no puede expresar en schema.prisma
-- Este archivo se ANEXA a la migración inicial con `pnpm db:init`
-- (ver scripts/crear-migracion-inicial.mjs). Es idempotente.
-- =============================================================================

-- RN-01 · RN-03 · RNF-05 -----------------------------------------------------
-- Una sola tabla de ocupación para reservas y bloqueos. Dos franjas activas del
-- mismo espacio NO pueden solaparse, aunque la validación de la app falle o
-- lleguen dos peticiones al mismo tiempo. '[)' = el fin es abierto, así una
-- reserva de 8:00-10:00 y otra de 10:00-12:00 no chocan.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Prisma crea `periodo` como columna normal (Unsupported). Se reemplaza por
-- una columna GENERADA que el motor calcula siempre a partir de inicio y fin.
ALTER TABLE franja_ocupada DROP COLUMN IF EXISTS periodo;
ALTER TABLE franja_ocupada
  ADD COLUMN periodo tstzrange
  GENERATED ALWAYS AS (tstzrange(inicio, fin, '[)')) STORED;

ALTER TABLE franja_ocupada
  DROP CONSTRAINT IF EXISTS franja_fin_mayor_inicio;
ALTER TABLE franja_ocupada
  ADD CONSTRAINT franja_fin_mayor_inicio CHECK (fin > inicio);

ALTER TABLE franja_ocupada
  DROP CONSTRAINT IF EXISTS sin_solapamiento;
ALTER TABLE franja_ocupada
  ADD CONSTRAINT sin_solapamiento
  EXCLUDE USING gist (espacio_id WITH =, periodo WITH &&)
  WHERE (estado <> 'LIBERADA');

-- RNF-02: la restricción de exclusión crea por sí misma un índice GiST sobre
-- (espacio_id, periodo). Las consultas de disponibilidad deben filtrar con
-- `espacio_id = $1 AND periodo && tstzrange($2, $3)` para usarlo.

ALTER TABLE reserva_item
  DROP CONSTRAINT IF EXISTS reserva_fin_mayor_inicio;
ALTER TABLE reserva_item
  ADD CONSTRAINT reserva_fin_mayor_inicio CHECK (fin > inicio);

-- Integridad de tablas "polimórficas" ----------------------------------------
-- Una foto pertenece exactamente a un espacio, un elemento o un servicio.
ALTER TABLE fotografia DROP CONSTRAINT IF EXISTS fotografia_un_dueno;
ALTER TABLE fotografia ADD CONSTRAINT fotografia_un_dueno CHECK (
  num_nonnulls(espacio_id, elemento_id, servicio_id) = 1
);

-- Una tarifa aplica exactamente a un espacio o a un servicio.
ALTER TABLE tarifa DROP CONSTRAINT IF EXISTS tarifa_un_objeto;
ALTER TABLE tarifa ADD CONSTRAINT tarifa_un_objeto CHECK (
  num_nonnulls(espacio_id, servicio_id) = 1
);

-- "Solo una portada por espacio" se garantiza en FotografiaService (un índice
-- parcial aquí sería borrado por Prisma en la siguiente migración).

-- Dinero nunca negativo.
ALTER TABLE tarifa DROP CONSTRAINT IF EXISTS tarifa_valor_no_negativo;
ALTER TABLE tarifa ADD CONSTRAINT tarifa_valor_no_negativo CHECK (valor >= 0);
ALTER TABLE orden_pago DROP CONSTRAINT IF EXISTS orden_pago_valor_positivo;
ALTER TABLE orden_pago ADD CONSTRAINT orden_pago_valor_positivo CHECK (valor > 0);

-- RF-AUD-03 · Bitácora inmutable --------------------------------------------
-- Ningún rol, ni siquiera la aplicación, puede editar o borrar registros.
CREATE OR REPLACE FUNCTION bitacora_inmutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'La bitácora es inmutable: % no permitido', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bitacora_sin_cambios ON bitacora;
CREATE TRIGGER bitacora_sin_cambios
  BEFORE UPDATE OR DELETE ON bitacora
  FOR EACH ROW EXECUTE FUNCTION bitacora_inmutable();

-- Tampoco se puede TRUNCATE.
DROP TRIGGER IF EXISTS bitacora_sin_truncate ON bitacora;
CREATE TRIGGER bitacora_sin_truncate
  BEFORE TRUNCATE ON bitacora
  FOR EACH STATEMENT EXECUTE FUNCTION bitacora_inmutable();
