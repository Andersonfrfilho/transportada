-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 279 T6b: tira a mensagem do sistema da conversa. Recusa quando ja existe aviso gravado: apagar a coluna os
-- deixaria como mensagens automaticas comuns, e apagar as linhas quebraria a leitura (`last_read_message_id`).
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "occurrence_conversation_messages" WHERE "system_notice" IS NOT NULL) THEN
    RAISE EXCEPTION 'Refusing to drop system_notice: conversation system messages exist';
  END IF;
END
$$;

DROP INDEX "occurrence_conversation_messages_system_notice_delivery_unique";
ALTER TABLE "occurrence_conversation_messages" DROP CONSTRAINT "occurrence_conversation_messages_system_notice_check";
ALTER TABLE "occurrence_conversation_messages" DROP COLUMN "system_notice";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261026215546_conversation_system_notice';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one conversation_system_notice journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
