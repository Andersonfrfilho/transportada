-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz a transcrição do áudio (Spec 264, contract.md §5.5). Sem CASCADE.
-- O que se perde: só dado derivado e regenerável (texto, idioma, duração medida, fila de tentativas e a
-- configuração por empresa). Os áudios continuam nos anexos e a mensagem nunca foi tocada.
-- Confira antes: select status, count(*) from occurrence_conversation_audio_transcriptions group by 1;

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
    WHERE "name" = '20261012140238_conversation_audio_transcription';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one conversation_audio_transcription journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
