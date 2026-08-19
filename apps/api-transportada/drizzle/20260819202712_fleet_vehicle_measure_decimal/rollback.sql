-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Devolve tara e capacidade a bigint, o inteiro que o layout do MDF-e transmite.
-- Destrutivo: a fração digitada pelo operador (8.000,25 kg) é arredondada para o inteiro mais
-- próximo e não volta. Só a parte inteira sobrevive ao caminho de volta.
BEGIN;

ALTER TABLE "fleet_vehicles" ALTER COLUMN "tare_weight_kg" DROP DEFAULT;
ALTER TABLE "fleet_vehicles" ALTER COLUMN "tare_weight_kg" SET DATA TYPE bigint USING round("tare_weight_kg")::bigint;
ALTER TABLE "fleet_vehicles" ALTER COLUMN "tare_weight_kg" SET DEFAULT 0;

ALTER TABLE "fleet_vehicles" ALTER COLUMN "capacity_kg" DROP DEFAULT;
ALTER TABLE "fleet_vehicles" ALTER COLUMN "capacity_kg" SET DATA TYPE bigint USING round("capacity_kg")::bigint;
ALTER TABLE "fleet_vehicles" ALTER COLUMN "capacity_kg" SET DEFAULT 0;

ALTER TABLE "fleet_vehicles" ALTER COLUMN "capacity_m3" DROP DEFAULT;
ALTER TABLE "fleet_vehicles" ALTER COLUMN "capacity_m3" SET DATA TYPE bigint USING round("capacity_m3")::bigint;
ALTER TABLE "fleet_vehicles" ALTER COLUMN "capacity_m3" SET DEFAULT 0;

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260819202712_fleet_vehicle_measure_decimal'
      AND "hash" = '0307e8c8d2c3ca3599d58456e1ed90f88d18b20801ce676aad6f7d9d7370d3ba';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one fleet_vehicle_measure_decimal migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
