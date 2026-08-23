-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Tira o segundo tanque do veículo. Perde o produto secundário e o consumo dele — o par não é
-- derivável do resto da linha, e o R$/km volta a ser a conta de um combustível só.
-- O custo é devolvido antes do `DROP COLUMN` de propósito: ele nomeia o consumo secundário, e sair
-- pela derrubada da coluna levaria junto a guarda dos outros cinco campos de custo.
BEGIN;

ALTER TABLE "fleet_vehicles" DROP CONSTRAINT "fleet_vehicles_cost_check", ADD CONSTRAINT "fleet_vehicles_cost_check" CHECK ("average_consumption" >= 0 and "other_costs_per_kilometer" >= 0 and "acquisition_amount" >= 0 and "monthly_installment_amount" >= 0 and "annual_vehicle_tax_amount" >= 0 and "annual_insurance_amount" >= 0);

ALTER TABLE "fleet_vehicles" DROP CONSTRAINT IF EXISTS "fleet_vehicles_secondary_fuel_check";

ALTER TABLE "fleet_vehicles" DROP COLUMN IF EXISTS "secondary_average_consumption";

ALTER TABLE "fleet_vehicles" DROP COLUMN IF EXISTS "secondary_fuel_type";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260821233830_fleet_vehicle_secondary_fuel'
      AND "hash" = '510e507f8101909032e8eddb62a3553dcafc8dd38a979894b4f7f7b09c4af5ce';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one fleet_vehicle_secondary_fuel migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
