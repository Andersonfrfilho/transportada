-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Drops the six cost/consumption columns and their check from fleet_vehicles.
-- Perde-se consumo médio, custo por km e os quatro valores monetários preenchidos depois da migration.
BEGIN;

ALTER TABLE "fleet_vehicles" DROP CONSTRAINT IF EXISTS "fleet_vehicles_cost_check";

ALTER TABLE "fleet_vehicles" DROP COLUMN IF EXISTS "costs_updated_at";
ALTER TABLE "fleet_vehicles" DROP COLUMN IF EXISTS "annual_insurance_amount";
ALTER TABLE "fleet_vehicles" DROP COLUMN IF EXISTS "annual_vehicle_tax_amount";
ALTER TABLE "fleet_vehicles" DROP COLUMN IF EXISTS "monthly_installment_amount";
ALTER TABLE "fleet_vehicles" DROP COLUMN IF EXISTS "acquisition_amount";
ALTER TABLE "fleet_vehicles" DROP COLUMN IF EXISTS "cost_per_kilometer";
ALTER TABLE "fleet_vehicles" DROP COLUMN IF EXISTS "average_consumption";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260813181604_fleet_vehicle_cost_fields'
      AND "hash" = '7b6806cfd1b1d464bd5afd22359609d9b513716451e02149d4f801426f383060';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one fleet_vehicle_cost_fields migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
