-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 276 T3b: tira a opção "fechar sozinha depois de entregar" e a causa `contractor_reply_id` do
-- andamento. Recusa se algum tipo usa a opção ou alguma ocorrência já fechou sozinha por ela: não
-- reescreve dado (o evento do andamento é só inserção).
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "company_occurrence_types" WHERE "contractor_reply_resolve_on_delivery"
  ) THEN
    RAISE EXCEPTION 'rollback recusado: existem tipos de ocorrência que fecham sozinhos ao entregar (spec 276)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "trip_occurrence_resolution_events" WHERE "contractor_reply_id" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'rollback recusado: existem ocorrências solucionadas pela entrega do retorno (spec 276)';
  END IF;
END
$$;

ALTER TABLE "trip_occurrence_resolution_events" DROP CONSTRAINT "trip_occurrence_resolution_events_system_case_event_check", ADD CONSTRAINT "trip_occurrence_resolution_events_system_case_event_check" CHECK (("actor_kind" = 'system') = ("case_event_id" is not null));
ALTER TABLE "trip_occurrence_resolution_events" DROP CONSTRAINT "trip_occurrence_resolution_events_system_cause_check";
ALTER TABLE "trip_occurrence_resolution_events" DROP CONSTRAINT "trip_occurrence_resolution_events_company_contractor_reply_fk";
DROP INDEX "trip_occurrence_resolution_events_contractor_reply_unique";
ALTER TABLE "trip_occurrence_resolution_events" DROP COLUMN "contractor_reply_id";
ALTER TABLE "company_occurrence_types" DROP COLUMN "contractor_reply_resolve_on_delivery";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261020181920_contractor_reply_resolve_on_delivery';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one contractor_reply_resolve_on_delivery journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
