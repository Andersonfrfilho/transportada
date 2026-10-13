-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 264 T3.4: a linha de `job_schedules`, as execuções gravadas e o nome da rotina nas duas CHECK.
--
-- ⚠️ Reverter só com o worker também revertido — senão a batida publica um job que o CHECK recusa.
-- Como o rollback da canhoto, apaga as execuções do job (histórico operacional, sem dado de negócio); as
-- transcrições em `occurrence_conversation_audio_transcriptions` ficam intocadas.
BEGIN;

DELETE FROM "job_executions" WHERE "job" = 'conversation.audio.transcribe';
DELETE FROM "job_schedules" WHERE "job" = 'conversation.audio.transcribe';

ALTER TABLE "job_schedules" DROP CONSTRAINT "job_schedules_job_check",
  ADD CONSTRAINT "job_schedules_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine', 'whatsapp.command.settle', 'trip.cargo-layout.purge', 'rate-limit.window.purge', 'trip.occurrence-attachment.purge', 'trip.occurrence-upload.expire', 'occurrence-conversation.upload.expire', 'trip.canhoto.read', 'cargo-preview.retention.apply', 'nfe.recipient-email.backfill', 'holiday.provider.pull'));
ALTER TABLE "job_executions" DROP CONSTRAINT "job_executions_job_check",
  ADD CONSTRAINT "job_executions_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine', 'whatsapp.command.settle', 'trip.cargo-layout.purge', 'rate-limit.window.purge', 'trip.occurrence-attachment.purge', 'trip.occurrence-upload.expire', 'occurrence-conversation.upload.expire', 'trip.canhoto.read', 'cargo-preview.retention.apply', 'nfe.recipient-email.backfill', 'holiday.provider.pull'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261012154238_conversation_audio_transcribe_job';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one conversation_audio_transcribe_job journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
