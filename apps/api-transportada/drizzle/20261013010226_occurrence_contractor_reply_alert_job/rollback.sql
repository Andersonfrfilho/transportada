-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 248 T4.10: a linha de `job_schedules` da rotina `occurrence.contractor-reply.alert` e o nome
-- dela nas duas CHECK de `job`. Os alertas que ela já contou (`alert_count`) e os eventos ficam.
--
-- ⚠️ Reverter só com o worker também revertido — senão a batida publica um job que o CHECK recusa.
BEGIN;

DELETE FROM "job_executions" WHERE "job" = 'occurrence.contractor-reply.alert';
DELETE FROM "job_schedules" WHERE "job" = 'occurrence.contractor-reply.alert';

ALTER TABLE "job_schedules" DROP CONSTRAINT "job_schedules_job_check",
  ADD CONSTRAINT "job_schedules_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine', 'whatsapp.command.settle', 'trip.cargo-layout.purge', 'rate-limit.window.purge', 'trip.occurrence-attachment.purge', 'trip.occurrence-upload.expire', 'occurrence-conversation.upload.expire', 'trip.canhoto.read', 'conversation.audio.transcribe', 'cargo-preview.retention.apply', 'nfe.recipient-email.backfill', 'holiday.provider.pull', 'occurrence.automatic-mail.sweep'));
ALTER TABLE "job_executions" DROP CONSTRAINT "job_executions_job_check",
  ADD CONSTRAINT "job_executions_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine', 'whatsapp.command.settle', 'trip.cargo-layout.purge', 'rate-limit.window.purge', 'trip.occurrence-attachment.purge', 'trip.occurrence-upload.expire', 'occurrence-conversation.upload.expire', 'trip.canhoto.read', 'conversation.audio.transcribe', 'cargo-preview.retention.apply', 'nfe.recipient-email.backfill', 'holiday.provider.pull', 'occurrence.automatic-mail.sweep'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261013010226_occurrence_contractor_reply_alert_job';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one occurrence_contractor_reply_alert_job journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
