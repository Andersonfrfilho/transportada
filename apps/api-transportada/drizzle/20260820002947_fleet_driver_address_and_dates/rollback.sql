-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz o endereço do motorista, a data de nascimento, a validade da CNH e a unicidade da CNH.
-- Destrutivo: o endereço e as duas datas de cada motorista são apagados. Reaplicar a migration
-- recria as colunas vazias — o que foi digitado não volta.
BEGIN;

ALTER TABLE "fleet_drivers" DROP CONSTRAINT IF EXISTS "fleet_drivers_address_length_check";
ALTER TABLE "fleet_drivers" DROP CONSTRAINT IF EXISTS "fleet_drivers_address_state_check";
ALTER TABLE "fleet_drivers" DROP CONSTRAINT IF EXISTS "fleet_drivers_postal_code_check";
ALTER TABLE "fleet_drivers" DROP CONSTRAINT IF EXISTS "fleet_drivers_dates_check";

DROP INDEX IF EXISTS "fleet_drivers_company_license_number_unique";

ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "state";
ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "city";
ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "district";
ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "complement";
ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "number";
ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "street";
ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "postal_code";
ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "birth_date";
ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "license_expires_at";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260820002947_fleet_driver_address_and_dates'
      AND "hash" = 'bfe1aefbef33a6f450c1c019da921fd0babe9a33b5c2a6228143ed668a1d7402';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one fleet_driver_address_and_dates migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
