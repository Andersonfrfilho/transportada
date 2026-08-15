-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Drops the five identity/model columns and their checks from fleet_vehicles.
-- Perde-se marca, modelo, ano, número de frota e eixos preenchidos depois da migration.
BEGIN;

ALTER TABLE "fleet_vehicles" DROP CONSTRAINT IF EXISTS "fleet_vehicles_axle_count_check";
ALTER TABLE "fleet_vehicles" DROP CONSTRAINT IF EXISTS "fleet_vehicles_model_year_check";
ALTER TABLE "fleet_vehicles" DROP CONSTRAINT IF EXISTS "fleet_vehicles_fleet_number_check";
ALTER TABLE "fleet_vehicles" DROP CONSTRAINT IF EXISTS "fleet_vehicles_model_check";
ALTER TABLE "fleet_vehicles" DROP CONSTRAINT IF EXISTS "fleet_vehicles_brand_check";

ALTER TABLE "fleet_vehicles" DROP COLUMN IF EXISTS "axle_count";
ALTER TABLE "fleet_vehicles" DROP COLUMN IF EXISTS "fleet_number";
ALTER TABLE "fleet_vehicles" DROP COLUMN IF EXISTS "model_year";
ALTER TABLE "fleet_vehicles" DROP COLUMN IF EXISTS "model";
ALTER TABLE "fleet_vehicles" DROP COLUMN IF EXISTS "brand";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260813151612_fleet_vehicle_model_fields'
      AND "hash" = '197092f1500844c64210871265724355fca6c321d8755a6d485e72ff1d64b141';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one fleet_vehicle_model_fields migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
