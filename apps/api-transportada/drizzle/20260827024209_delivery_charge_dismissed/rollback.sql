-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverte o estado `dismissed` do lancamento (spec 060 T005).
--
-- Reverter **quebra** se alguma sugestao descartada existir, e e deliberado: apagar o descarte em
-- silencio faria a taxa recusada por gente desaparecer sem motivo registrado, e a regra recorrente
-- voltaria a propo-la sem ninguem entender por que.
BEGIN;

DO $$
DECLARE
  affected integer;
BEGIN
  SELECT count(*) INTO affected FROM "delivery_charges" WHERE "status" = 'dismissed';
  IF affected > 0 THEN
    RAISE EXCEPTION 'Dismissed delivery charges: %. Decide their fate before rolling back.', affected;
  END IF;
END
$$;

ALTER TABLE "delivery_charges" DROP CONSTRAINT "delivery_charges_status_check",
  ADD CONSTRAINT "delivery_charges_status_check" CHECK ("status" in ('suggested', 'recorded', 'submitted', 'approved', 'rejected', 'reimbursed'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260827024209_delivery_charge_dismissed'
      AND "hash" = '884e903ae9ad9d46a1b6efefde3c98d4b8a7c7f3b9d4d344fc9d5750ac4d7682';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one delivery_charge_dismissed migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
