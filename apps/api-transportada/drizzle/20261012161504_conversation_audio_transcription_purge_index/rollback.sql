-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz o índice parcial do expurgo da transcrição (spec 264, M5). Só o índice: nenhum dado é tocado.
BEGIN;

DROP INDEX "occurrence_conversation_audio_transcriptions_purge_idx";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261012161504_conversation_audio_transcription_purge_index';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one conversation_audio_transcription_purge_index journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
