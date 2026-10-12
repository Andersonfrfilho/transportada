-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz a transcrição de áudio da conversa (Spec 264). Sem CASCADE.
-- O que se perde: as transcrições gravadas e a configuração por empresa. É dado derivado do áudio, que continua
-- na conversa, e a rotina o regenera se a migration for reaplicada (o marco `enabled_since` recomeça em now()).

BEGIN;

SET LOCAL lock_timeout = '3s';

DROP INDEX IF EXISTS "occurrence_conversation_attachments_audio_created_idx";
DROP TABLE IF EXISTS "occurrence_conversation_audio_transcriptions";
DROP TABLE IF EXISTS "company_audio_transcription_settings";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261012155134_conversation_audio_transcription';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one conversation_audio_transcription journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
