-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Drops the vehicle color column and its check from fleet_vehicles.
-- Perde-se a cor preenchida depois da migration; o CRLV segue sendo a fonte para recadastrar.
BEGIN;

ALTER TABLE "fleet_vehicles" DROP CONSTRAINT IF EXISTS "fleet_vehicles_color_check";

ALTER TABLE "fleet_vehicles" DROP COLUMN IF EXISTS "color";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260814131353_fleet_vehicle_color'
      AND "hash" = 'f99dada233b55432c4b05592302d074592f08ee2acdcf263b3ac6cc2961f6396';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one fleet_vehicle_color migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
