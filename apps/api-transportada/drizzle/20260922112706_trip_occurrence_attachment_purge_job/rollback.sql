-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 161 T18: a rotina `trip.occurrence-attachment.purge` e o índice que a serve.
--
-- ⚠️ Reverter só com o worker também revertido — senão a batida publica um job que o CHECK recusa.
-- Sem o índice, a próxima instalação do expurgo varre `stored_objects` inteira ao reaplicar a
-- migration seguinte. Nenhuma foto é apagada por este rollback: ele só desliga a rotina que apaga.
BEGIN;

DELETE FROM "job_executions" WHERE "job" = 'trip.occurrence-attachment.purge';
DELETE FROM "job_schedules" WHERE "job" = 'trip.occurrence-attachment.purge';

ALTER TABLE "job_schedules" DROP CONSTRAINT "job_schedules_job_check",
  ADD CONSTRAINT "job_schedules_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine', 'whatsapp.command.settle', 'trip.cargo-layout.purge', 'rate-limit.window.purge'));
ALTER TABLE "job_executions" DROP CONSTRAINT "job_executions_job_check",
  ADD CONSTRAINT "job_executions_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine', 'whatsapp.command.settle', 'trip.cargo-layout.purge', 'rate-limit.window.purge'));

DROP INDEX IF EXISTS "stored_objects_purpose_retention_idx";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260922112706_trip_occurrence_attachment_purge_job';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_occurrence_attachment_purge_job journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
