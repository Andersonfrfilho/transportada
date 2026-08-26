-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Drops the driver Pix key columns (payment key type and value).
BEGIN;

ALTER TABLE "fleet_drivers" DROP CONSTRAINT IF EXISTS "fleet_drivers_pix_key_check";
ALTER TABLE "fleet_drivers" DROP CONSTRAINT IF EXISTS "fleet_drivers_pix_key_type_check";
ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "pix_key";
ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "pix_key_type";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260825215905_quick_flatman'
      AND "hash" = '14c07678915d0d9b86e81e4ec419bd23f1ef317291567b29ce730858ef804c78';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one quick_flatman migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
