-- Devolve o catálogo ao estado anterior: a coluna sai com os valores, e as duas linhas semeadas
-- saem junto. Ficha de veículo não é tocada — esta migration nunca escreveu em `fleet_vehicles`.
DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260907120000_vehicle_reference_payload';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one vehicle_reference_payload journal entry, removed %',
      deleted_migrations;
  END IF;
END $$;

-- ⚠️ Só as duas que esta migration semeou. Um `delete` amplo levaria junto linha que alguém
-- acrescentou depois, e o catálogo não guarda de onde cada linha veio.
DELETE FROM "vehicle_volume_references"
  WHERE ("vehicle_type", "body_type") IN (('three_quarter', '02'), ('motorcycle', '02'));

ALTER TABLE "vehicle_volume_references"
	DROP CONSTRAINT IF EXISTS "vehicle_volume_references_payload_check";

ALTER TABLE "vehicle_volume_references" DROP COLUMN IF EXISTS "max_payload_kg";
