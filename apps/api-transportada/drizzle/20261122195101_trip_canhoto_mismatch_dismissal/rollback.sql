-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Tira a coluna do descarte do alerta de canhoto de outra nota (spec 344 T5d). Os descartes já
-- feitos se perdem: reaplicar a migration faz o alerta voltar em toda foto que o escritório dispensou.
BEGIN;

SET LOCAL lock_timeout = '3s';

ALTER TABLE "trip_delivery_proofs" DROP COLUMN "canhoto_mismatch_dismissed_at";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261122195101_trip_canhoto_mismatch_dismissal';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_canhoto_mismatch_dismissal journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
