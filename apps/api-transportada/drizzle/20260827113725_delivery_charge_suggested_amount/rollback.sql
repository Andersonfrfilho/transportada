-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverte a brecha de valor zero na sugestao (spec 060 T013).
--
-- Reverter **quebra** se existir sugestao sem valor — e e deliberado: essas linhas sao ocorrencias
-- do motorista aguardando o escritorio preencher o valor do recibo. Apaga-las em silencio jogaria
-- fora exatamente o aviso que a spec existe para capturar.
BEGIN;

DO $$
DECLARE
  affected integer;
BEGIN
  SELECT count(*) INTO affected FROM "delivery_charges" WHERE "amount" <= 0;
  IF affected > 0 THEN
    RAISE EXCEPTION 'Suggestions waiting for an amount: %. Fill or dismiss them before rolling back.', affected;
  END IF;
END
$$;

ALTER TABLE "delivery_charges" DROP CONSTRAINT "delivery_charges_amount_check",
  ADD CONSTRAINT "delivery_charges_amount_check" CHECK ("amount" > 0);

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260827113725_delivery_charge_suggested_amount'
      AND "hash" = 'dfa5955fe37eff0f29c82588dfe550b11fb733a2dedb398a268608b9ef80e610';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one delivery_charge_suggested_amount migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
