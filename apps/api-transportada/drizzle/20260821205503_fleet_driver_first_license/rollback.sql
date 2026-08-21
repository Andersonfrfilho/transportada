-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Retira a data da primeira habilitação da ficha do motorista e devolve o CHECK de datas às duas
-- datas que ele cobria. Perde o que foi digitado — a data não é derivável do resto da linha.
BEGIN;

ALTER TABLE "fleet_drivers" DROP CONSTRAINT IF EXISTS "fleet_drivers_dates_check";

ALTER TABLE "fleet_drivers" ADD CONSTRAINT "fleet_drivers_dates_check" CHECK (("birth_date" is null or "birth_date" >= date '1900-01-01') and ("license_expires_at" is null or "license_expires_at" >= date '1900-01-01'));

ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "first_license_at";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260821205503_fleet_driver_first_license'
      AND "hash" = 'aa5e27105182417547255f19e31b6b594b9ca8a6f1989d6ebe2f7ce24b142dac';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one fleet_driver_first_license migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
