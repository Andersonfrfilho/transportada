-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Derruba as tabelas de preço de combustível e devolve fleet_vehicles ao custo por quilômetro armazenado.
-- A coluna volta vazia: o valor antigo era digitado, e recuperá-lo aqui seria inventar dinheiro.
BEGIN;

ALTER TABLE "fleet_vehicles" DROP CONSTRAINT "fleet_vehicles_cost_check";

ALTER TABLE "fleet_vehicles" DROP CONSTRAINT "fleet_vehicles_fuel_type_check";

ALTER TABLE "fleet_vehicles" ADD COLUMN "cost_per_kilometer" numeric(12,4) DEFAULT '0' NOT NULL;

ALTER TABLE "fleet_vehicles" DROP COLUMN "other_costs_per_kilometer";

ALTER TABLE "fleet_vehicles" DROP COLUMN "fuel_type";

ALTER TABLE "fleet_vehicles" ADD CONSTRAINT "fleet_vehicles_cost_check" CHECK ("average_consumption" >= 0 and "cost_per_kilometer" >= 0 and "acquisition_amount" >= 0 and "monthly_installment_amount" >= 0 and "annual_vehicle_tax_amount" >= 0 and "annual_insurance_amount" >= 0);

DROP TABLE "company_fuel_prices";

DROP TABLE "fuel_price_references";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260815001423_fuel_price_reference'
      AND "hash" = '3c53f858f0e331c9a9b2b5fc7fc278b6ff28c9d7353513c9fdde08b9dc2fd1c6';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one fuel_price_reference migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
