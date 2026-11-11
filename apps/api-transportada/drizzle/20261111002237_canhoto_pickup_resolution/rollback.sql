-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 321 T4: tira a coleta de canhoto como causa do andamento (266) e a marca da foto enviada. Recusa se alguma
-- ocorrência já foi resolvida ou reaberta pela coleta, ou se alguma coleta já tem foto: não reescreve dado (o evento do
-- andamento é só inserção).
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "trip_occurrence_resolution_events" WHERE "canhoto_pickup_id" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'rollback recusado: existem ocorrências resolvidas ou reabertas pela coleta de canhoto (spec 321)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "trip_canhoto_pickups" WHERE "photo_sent_at" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'rollback recusado: existem coletas de canhoto com a foto enviada (spec 321)';
  END IF;
END
$$;

ALTER TABLE "trip_occurrence_resolution_events" DROP CONSTRAINT "trip_occurrence_resolution_events_reopen_check", ADD CONSTRAINT "trip_occurrence_resolution_events_reopen_check" CHECK ("kind" <> 'reopened' or ("actor_kind" = 'driver' and "conversation_message_id" is not null));
ALTER TABLE "trip_occurrence_resolution_events" DROP CONSTRAINT "trip_occurrence_resolution_events_system_cause_check", ADD CONSTRAINT "trip_occurrence_resolution_events_system_cause_check" CHECK (num_nonnulls("case_event_id", "contractor_reply_id") <= 1);
ALTER TABLE "trip_occurrence_resolution_events" DROP CONSTRAINT "trip_occurrence_resolution_events_system_case_event_check", ADD CONSTRAINT "trip_occurrence_resolution_events_system_case_event_check" CHECK (("actor_kind" = 'system') = (num_nonnulls("case_event_id", "contractor_reply_id") = 1));
ALTER TABLE "trip_occurrence_resolution_events" DROP CONSTRAINT "trip_occurrence_resolution_events_canhoto_pickup_owner_check";
ALTER TABLE "trip_canhoto_pickups" DROP CONSTRAINT "trip_canhoto_pickups_photo_sent_check";
ALTER TABLE "trip_occurrence_resolution_events" DROP CONSTRAINT "trip_occurrence_resolution_events_company_canhoto_pickup_fk";
DROP INDEX "trip_occurrence_resolution_events_canhoto_pickup_idx";
ALTER TABLE "trip_occurrence_resolution_events" DROP COLUMN "canhoto_pickup_id";
ALTER TABLE "trip_canhoto_pickups" DROP COLUMN "photo_sent_at";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261111002237_canhoto_pickup_resolution';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one canhoto_pickup_resolution journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
