-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 248 T2.3: a linha de `job_schedules` da rotina `nfe.recipient-email.backfill` e o nome
-- dela nas duas CHECK de `job`. Os e-mails que ela já preencheu em `nfe_documents` ficam.
--
-- ⚠️ Reverter só com o worker também revertido — senão a batida publica um job que o CHECK recusa.
BEGIN;

DELETE FROM "job_executions" WHERE "job" = 'nfe.recipient-email.backfill';
DELETE FROM "job_schedules" WHERE "job" = 'nfe.recipient-email.backfill';

ALTER TABLE "job_schedules" DROP CONSTRAINT "job_schedules_job_check",
  ADD CONSTRAINT "job_schedules_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine', 'whatsapp.command.settle', 'trip.cargo-layout.purge', 'rate-limit.window.purge', 'trip.occurrence-attachment.purge', 'trip.occurrence-upload.expire', 'occurrence-conversation.upload.expire', 'trip.canhoto.read', 'cargo-preview.retention.apply'));
ALTER TABLE "job_executions" DROP CONSTRAINT "job_executions_job_check",
  ADD CONSTRAINT "job_executions_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine', 'whatsapp.command.settle', 'trip.cargo-layout.purge', 'rate-limit.window.purge', 'trip.occurrence-attachment.purge', 'trip.occurrence-upload.expire', 'occurrence-conversation.upload.expire', 'trip.canhoto.read', 'cargo-preview.retention.apply'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261008164340_nfe_recipient_email_backfill_job';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one nfe_recipient_email_backfill_job journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
