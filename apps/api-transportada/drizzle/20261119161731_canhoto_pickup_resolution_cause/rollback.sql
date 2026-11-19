-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 321 T8: tira a causa do `resolved` pela coleta de canhoto. Recusa se alguma ocorrência já foi concluída pelo
-- encaixe da coleta: sem a coluna, aquele `resolved` passaria a ser lido como canhoto aprovado (o evento do andamento é
-- só inserção, e o rollback não reescreve dado).
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "trip_occurrence_resolution_events" WHERE "canhoto_pickup_cause" = 'scheduled'
  ) THEN
    RAISE EXCEPTION 'rollback recusado: existem ocorrências concluídas pelo encaixe da coleta de canhoto (spec 321 T8)';
  END IF;
END
$$;

ALTER TABLE "trip_occurrence_resolution_events" DROP CONSTRAINT "trip_occurrence_resolution_events_canhoto_pickup_cause_check";
ALTER TABLE "trip_occurrence_resolution_events" DROP COLUMN "canhoto_pickup_cause";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261119161731_canhoto_pickup_resolution_cause';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one canhoto_pickup_resolution_cause journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
