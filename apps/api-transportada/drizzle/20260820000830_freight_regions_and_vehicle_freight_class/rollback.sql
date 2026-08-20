-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a tabela de frete por região e a classe comercial do veículo.
-- Destrutivo: as rotas, as cidades, os valores pagos ao motorista e a cobertura de cada motorista
-- são apagados, e a classe do veículo volta a não existir. Reaplicar a migration recria as tabelas
-- vazias e repõe a classe pelo rodado — o que foi digitado à mão (VUC, 3/4) não volta.
BEGIN;

DROP TABLE IF EXISTS "fleet_driver_regions";
DROP TABLE IF EXISTS "freight_region_cities";
DROP TABLE IF EXISTS "freight_region_driver_rates";
DROP TABLE IF EXISTS "freight_regions";

ALTER TABLE "fleet_vehicles" DROP COLUMN IF EXISTS "freight_class";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260820000830_freight_regions_and_vehicle_freight_class'
      AND "hash" = '9009e7e59367af87337f3caa34ff7f9d753c02f42e2bccfe82e0dcca531b916f';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one freight_regions_and_vehicle_freight_class migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
