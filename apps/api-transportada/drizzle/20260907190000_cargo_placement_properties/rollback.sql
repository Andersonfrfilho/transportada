-- Devolve a caixa sem as propriedades de posicionamento e derruba a tabela de eixos. Medida de
-- caixa e ficha de veículo não são tocadas — esta migration nunca escreveu nelas.
DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260907190000_cargo_placement_properties';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one cargo_placement_properties journal entry, removed %',
      deleted_migrations;
  END IF;
END $$;

DROP TABLE IF EXISTS "fleet_vehicle_axles";

ALTER TABLE "nfe_package_boxes" DROP CONSTRAINT IF EXISTS "nfe_package_boxes_stack_check";

ALTER TABLE "nfe_package_boxes"
	DROP COLUMN IF EXISTS "is_stackable",
	DROP COLUMN IF EXISTS "max_stack_count",
	DROP COLUMN IF EXISTS "is_fragile",
	DROP COLUMN IF EXISTS "keep_upright";
