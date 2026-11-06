-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 299 T1.2: derruba as duas tabelas novas (os lembretes gravados se perdem), apaga a linha do relógio
-- da rotina `driver.stop-reminder.dispatch` e devolve as duas CHECK de `job` sem o nome dela.
--
-- ⚠️ Reverter só com o worker também revertido — senão a batida publica um job que o CHECK recusa.
BEGIN;

DELETE FROM "job_executions" WHERE "job" = 'driver.stop-reminder.dispatch';
DELETE FROM "job_schedules" WHERE "job" = 'driver.stop-reminder.dispatch';

ALTER TABLE "job_schedules" DROP CONSTRAINT "job_schedules_job_check",
  ADD CONSTRAINT "job_schedules_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine', 'whatsapp.command.settle', 'trip.cargo-layout.purge', 'rate-limit.window.purge', 'trip.occurrence-attachment.purge', 'trip.occurrence-upload.expire', 'occurrence-conversation.upload.expire', 'trip.canhoto.read', 'conversation.audio.transcribe', 'cargo-preview.retention.apply', 'nfe.recipient-email.backfill', 'holiday.provider.pull', 'occurrence.automatic-mail.sweep', 'occurrence.contractor-reply.alert'));--> statement-breakpoint;
ALTER TABLE "job_executions" DROP CONSTRAINT "job_executions_job_check",
  ADD CONSTRAINT "job_executions_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine', 'whatsapp.command.settle', 'trip.cargo-layout.purge', 'rate-limit.window.purge', 'trip.occurrence-attachment.purge', 'trip.occurrence-upload.expire', 'occurrence-conversation.upload.expire', 'trip.canhoto.read', 'conversation.audio.transcribe', 'cargo-preview.retention.apply', 'nfe.recipient-email.backfill', 'holiday.provider.pull', 'occurrence.automatic-mail.sweep', 'occurrence.contractor-reply.alert'));--> statement-breakpoint;

DROP TABLE "driver_stop_reminders";
DROP TABLE "company_driver_reminder_settings";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261106232509_driver_stop_reminders';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one driver_stop_reminders journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
