-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz o registro da rotina conversation.audio.transcribe no relógio (Spec 264). Perde as execuções
-- gravadas dela: histórico operacional, sem dado de negócio.

BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  open_executions integer;
BEGIN
  SELECT count(*) INTO open_executions FROM "job_executions"
    WHERE "job" = 'conversation.audio.transcribe' AND "finished_at" IS NULL;
  IF open_executions > 0 THEN
    RAISE EXCEPTION 'Rollback recusado: % execução(ões) aberta(s) de conversation.audio.transcribe', open_executions;
  END IF;
END
$$;

DELETE FROM "job_executions" WHERE "job" = 'conversation.audio.transcribe';
DELETE FROM "job_schedules" WHERE "job" = 'conversation.audio.transcribe';

ALTER TABLE "job_executions" DROP CONSTRAINT "job_executions_job_check", ADD CONSTRAINT "job_executions_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine', 'whatsapp.command.settle', 'trip.cargo-layout.purge', 'rate-limit.window.purge', 'trip.occurrence-attachment.purge', 'trip.occurrence-upload.expire', 'occurrence-conversation.upload.expire', 'trip.canhoto.read', 'cargo-preview.retention.apply', 'nfe.recipient-email.backfill', 'holiday.provider.pull'));--> statement-breakpoint;
ALTER TABLE "job_schedules" DROP CONSTRAINT "job_schedules_job_check", ADD CONSTRAINT "job_schedules_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine', 'whatsapp.command.settle', 'trip.cargo-layout.purge', 'rate-limit.window.purge', 'trip.occurrence-attachment.purge', 'trip.occurrence-upload.expire', 'occurrence-conversation.upload.expire', 'trip.canhoto.read', 'cargo-preview.retention.apply', 'nfe.recipient-email.backfill', 'holiday.provider.pull'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261012162341_conversation_audio_transcription_job';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one conversation_audio_transcription_job journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
