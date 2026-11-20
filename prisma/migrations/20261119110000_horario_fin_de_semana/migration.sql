-- Abre los días de fin de semana que aún no tienen horario, copiando el lunes.
-- Conserva cualquier horario de sábado o domingo configurado previamente.
INSERT INTO "horario_operacion" ("id", "espacio_id", "dia_semana", "abre", "cierra")
SELECT gen_random_uuid(), lunes."espacio_id", fin_de_semana."dia_semana", lunes."abre", lunes."cierra"
FROM "horario_operacion" AS lunes
CROSS JOIN (VALUES (0), (6)) AS fin_de_semana("dia_semana")
WHERE lunes."dia_semana" = 1
ON CONFLICT ("espacio_id", "dia_semana") DO NOTHING;
