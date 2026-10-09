-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz o assunto da conversa (spec 260, ADR-0101). Sem CASCADE.
-- ⚠️ Recusa rodar enquanto existir conversa de nota ou de viagem, ou envio de arquivo apontando uma
-- conversa: apagá-los perderia mensagens, e os `SET NOT NULL` de volta falhariam nas linhas sem ocorrência.
-- Confira antes: select subject_type, count(*) from occurrence_conversations group by 1;
--
-- O que se perde: só `client_message_id` (o eco da Idempotency-Key nas mensagens). Se a migration
-- `conversation_protocol` estiver aplicada, reverta ela antes: esta não a conhece.

BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  subject_conversations integer;
  conversation_uploads integer;
BEGIN
  SELECT count(*) INTO subject_conversations
    FROM "occurrence_conversations" WHERE "subject_type" <> 'occurrence';
  SELECT count(*) INTO conversation_uploads
    FROM "occurrence_conversation_uploads" WHERE "conversation_id" IS NOT NULL;

  IF subject_conversations > 0 OR conversation_uploads > 0 THEN
    RAISE EXCEPTION 'conversas de nota/viagem existem; decidir antes de reverter (conversas: %, envios de arquivo: %)',
      subject_conversations, conversation_uploads;
  END IF;
END
$$;

ALTER TABLE "occurrence_conversation_uploads"
  DROP CONSTRAINT IF EXISTS "occurrence_conversation_uploads_subject_check";
ALTER TABLE "occurrence_conversation_uploads"
  DROP CONSTRAINT IF EXISTS "occurrence_conversation_uploads_conversation_fk";
ALTER TABLE "occurrence_conversation_uploads"
  DROP COLUMN IF EXISTS "conversation_id";
ALTER TABLE "occurrence_conversation_uploads" ALTER COLUMN "occurrence_kind" SET NOT NULL;
ALTER TABLE "occurrence_conversation_uploads" ALTER COLUMN "occurrence_id" SET NOT NULL;

DROP INDEX IF EXISTS "occurrence_conversation_messages_client_message_unique";
ALTER TABLE "occurrence_conversation_messages"
  DROP CONSTRAINT IF EXISTS "occurrence_conversation_messages_client_message_id_check";
ALTER TABLE "occurrence_conversation_messages"
  DROP COLUMN IF EXISTS "client_message_id";

DROP INDEX IF EXISTS "occurrence_conversations_trip_idx";
DROP INDEX IF EXISTS "occurrence_conversations_driver_user_idx";
DROP INDEX IF EXISTS "occurrence_conversations_trip_subject_unique";
DROP INDEX IF EXISTS "occurrence_conversations_document_subject_unique";
ALTER TABLE "occurrence_conversations"
  DROP CONSTRAINT IF EXISTS "occurrence_conversations_subject_shape_check";
ALTER TABLE "occurrence_conversations"
  DROP CONSTRAINT IF EXISTS "occurrence_conversations_subject_type_check";
ALTER TABLE "occurrence_conversations"
  DROP CONSTRAINT IF EXISTS "occurrence_conversations_trip_document_fk";
ALTER TABLE "occurrence_conversations"
  DROP CONSTRAINT IF EXISTS "occurrence_conversations_trip_fk";
ALTER TABLE "occurrence_conversations" DROP COLUMN IF EXISTS "trip_document_id";
ALTER TABLE "occurrence_conversations" DROP COLUMN IF EXISTS "trip_id";
ALTER TABLE "occurrence_conversations" DROP COLUMN IF EXISTS "subject_type";
ALTER TABLE "occurrence_conversations" ALTER COLUMN "occurrence_kind" SET NOT NULL;
ALTER TABLE "occurrence_conversations" ALTER COLUMN "occurrence_id" SET NOT NULL;

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261009170338_conversation_subject';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one conversation_subject journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
