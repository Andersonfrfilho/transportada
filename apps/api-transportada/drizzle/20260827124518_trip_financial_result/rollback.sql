-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverte a spec 061 T002: o resultado congelado da viagem, o custo avulso, o modelo de pagamento
-- do motorista e o regime federal da empresa.
--
-- Reverter **apaga historico congelado**: cada linha de `trip_financial_results` e a foto de uma
-- viagem no dia em que ela fechou, com as premissas usadas. Ela nao se reconstroi depois — preco de
-- combustivel, tabela de agregado e aliquota ja mudaram. Quem reverter exporta antes.
--
-- E **quebra** se algum motorista ja estiver marcado como assalariado: apagar o modelo de pagamento
-- em silencio faria o custo dele voltar a sair da tabela de regiao, que nao e a dele.
BEGIN;

DO $$
DECLARE
  affected integer;
BEGIN
  SELECT count(*) INTO affected FROM "fleet_drivers" WHERE "payment_model" = 'fixed';
  IF affected > 0 THEN
    RAISE EXCEPTION 'Drivers paid a fixed salary: %. Decide their payment model before rolling back.', affected;
  END IF;
END
$$;

ALTER TABLE "fleet_drivers" DROP CONSTRAINT IF EXISTS "fleet_drivers_payment_period_check";
ALTER TABLE "fleet_drivers" DROP CONSTRAINT IF EXISTS "fleet_drivers_payment_shape_check";
ALTER TABLE "fleet_drivers" DROP CONSTRAINT IF EXISTS "fleet_drivers_payment_model_check";
ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "payment_closing_day";
ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "payment_period";
ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "fixed_amount";
ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "payment_model";

DROP TABLE IF EXISTS "trip_financial_parcels";
DROP TABLE IF EXISTS "trip_financial_results";
DROP TABLE IF EXISTS "trip_cost_entries";
DROP TABLE IF EXISTS "company_tax_settings";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260827124518_trip_financial_result'
      AND "hash" = '78037d94a8253d2d5cb6ba2ac2a7e65ca282c73e8f8edf1db9a4c24f63da442e';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_financial_result migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
