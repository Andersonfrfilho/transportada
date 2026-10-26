-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 279 T4b: tira o e-mail detectado da mensagem da conversa. Recusa com mensagem que ja tem e-mail detectado (o
-- endereco e o estado do cartao se perderiam).
-- Confira antes: select count(*) from occurrence_conversation_messages where detected_email is not null;
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  detected integer;
BEGIN
  SELECT count(*) INTO detected FROM "occurrence_conversation_messages" WHERE "detected_email" IS NOT NULL;

  IF detected > 0 THEN
    RAISE EXCEPTION 'rollback recusado: % mensagem(ns) com e-mail detectado seriam perdidas (spec 279)', detected;
  END IF;
END
$$;

ALTER TABLE "occurrence_conversation_messages" DROP CONSTRAINT "occurrence_conversation_messages_detected_email_check";
ALTER TABLE "occurrence_conversation_messages" DROP COLUMN "detected_email_sent_at";
ALTER TABLE "occurrence_conversation_messages" DROP COLUMN "detected_email";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261026221939_conversation_message_detected_email';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one conversation_message_detected_email journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
