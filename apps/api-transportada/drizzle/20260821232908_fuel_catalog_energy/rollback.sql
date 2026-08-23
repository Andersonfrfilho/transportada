-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Devolve os três CHECKs ao catálogo de cinco produtos da ANP, sem `eletrico`. Se alguma linha já
-- nomear o produto novo — veículo, referência ou ajuste de preço — o `ADD CONSTRAINT` falha e o
-- rollback aborta inteiro: apagar a linha do cliente para caber no catálogo antigo seria perder
-- cadastro sem ninguém pedir.
BEGIN;

ALTER TABLE "fleet_vehicles" DROP CONSTRAINT "fleet_vehicles_fuel_type_check", ADD CONSTRAINT "fleet_vehicles_fuel_type_check" CHECK ("fuel_type" in ('diesel-s10', 'diesel-s500', 'gasolina-comum', 'etanol-hidratado', 'gnv'));

ALTER TABLE "fuel_price_references" DROP CONSTRAINT "fuel_price_references_product_check", ADD CONSTRAINT "fuel_price_references_product_check" CHECK ("product" in ('diesel-s10', 'diesel-s500', 'gasolina-comum', 'etanol-hidratado', 'gnv'));

ALTER TABLE "company_fuel_prices" DROP CONSTRAINT "company_fuel_prices_product_check", ADD CONSTRAINT "company_fuel_prices_product_check" CHECK ("product" in ('diesel-s10', 'diesel-s500', 'gasolina-comum', 'etanol-hidratado', 'gnv'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260821232908_fuel_catalog_energy'
      AND "hash" = '835739883fe0b939b242517bc293bd31af66aa146e6ccf3bdecc35a9fcc58070';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one fuel_catalog_energy migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
