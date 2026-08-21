-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Retira a categoria da CNH da ficha do motorista. Perde o que foi digitado — a categoria não é
-- derivável do número da habilitação nem do resto da linha.
BEGIN;

ALTER TABLE "fleet_drivers" DROP CONSTRAINT IF EXISTS "fleet_drivers_license_category_check";

ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "license_category";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260821201036_fleet_driver_license_category'
      AND "hash" = 'e6f591d475e3946857222dce595f1130c326b99883d467b6c0746c408e5c52a2';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one fleet_driver_license_category migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
