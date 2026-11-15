-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 339 T4: remove a caixa de saída `pickup_request_notifications`, a linha do relógio e as execuções da
-- rotina `pickup-request.notify`, e devolve as duas CHECK de `job` sem o nome dela.
--
-- ⚠️ Reverter só com o worker também revertido — senão a batida publica um job que o CHECK recusa.
-- ⚠️ Recusa quando a caixa de saída tem linhas: apagar avisos pendentes perderia e-mail e WhatsApp ainda não entregues.
BEGIN;

DO $$
DECLARE
  notification_rows bigint;
BEGIN
  SELECT count(*) INTO notification_rows FROM "pickup_request_notifications";
  IF notification_rows > 0 THEN
    RAISE EXCEPTION 'Refusing rollback: pickup_request_notifications has % row(s)', notification_rows;
  END IF;
END
$$;

DELETE FROM "job_executions" WHERE "job" = 'pickup-request.notify';
DELETE FROM "job_schedules" WHERE "job" = 'pickup-request.notify';

ALTER TABLE "job_schedules" DROP CONSTRAINT "job_schedules_job_check",
  ADD CONSTRAINT "job_schedules_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine', 'whatsapp.command.settle', 'trip.cargo-layout.purge', 'rate-limit.window.purge', 'trip.occurrence-attachment.purge', 'trip.occurrence-upload.expire', 'occurrence-conversation.upload.expire', 'trip.canhoto.read', 'conversation.audio.transcribe', 'cargo-preview.retention.apply', 'nfe.recipient-email.backfill', 'holiday.provider.pull', 'occurrence.automatic-mail.sweep', 'occurrence.contractor-reply.alert', 'driver.stop-reminder.dispatch', 'whatsapp-inbox.chat.expire', 'company-expense.occurrence.generate', 'company-expense.reminder.send'));
ALTER TABLE "job_executions" DROP CONSTRAINT "job_executions_job_check",
  ADD CONSTRAINT "job_executions_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine', 'whatsapp.command.settle', 'trip.cargo-layout.purge', 'rate-limit.window.purge', 'trip.occurrence-attachment.purge', 'trip.occurrence-upload.expire', 'occurrence-conversation.upload.expire', 'trip.canhoto.read', 'conversation.audio.transcribe', 'cargo-preview.retention.apply', 'nfe.recipient-email.backfill', 'holiday.provider.pull', 'occurrence.automatic-mail.sweep', 'occurrence.contractor-reply.alert', 'driver.stop-reminder.dispatch', 'whatsapp-inbox.chat.expire', 'company-expense.occurrence.generate', 'company-expense.reminder.send'));

DROP TABLE "pickup_request_notifications";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261115140000_pickup_request_notifications';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one pickup_request_notifications journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
