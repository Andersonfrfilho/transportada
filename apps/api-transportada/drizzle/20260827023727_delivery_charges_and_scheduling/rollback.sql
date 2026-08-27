-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverte a spec 060 T003: agendamento da parada, lancamento de taxa, regra recorrente, lote de
-- repasse e a trilha do lancamento.
--
-- Reverter **apaga dinheiro em transito**: lancamento submetido, aprovado ou ja reembolsado some
-- junto com o lote que o contratante recebeu por link. Quem reverter exporta o relatorio de cada
-- lote antes — depois nao ha de onde tirar.
BEGIN;

DROP TABLE IF EXISTS "delivery_charge_events";
DROP TABLE IF EXISTS "delivery_charges";
DROP TABLE IF EXISTS "extra_charge_batches";
DROP TABLE IF EXISTS "delivery_client_charge_rules";
DROP TABLE IF EXISTS "trip_stop_schedules";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260827023727_delivery_charges_and_scheduling'
      AND "hash" = '821c6c4c2d0aaa03974d7d8282aaa83adf60ec5046b0972991737a09676da094';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one delivery_charges_and_scheduling migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
