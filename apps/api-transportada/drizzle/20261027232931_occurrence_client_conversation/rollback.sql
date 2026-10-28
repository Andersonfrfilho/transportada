-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 283 T2: tira a conversa do cliente. Recusa quando ja existe conversa do cliente: apagar as linhas quebraria a
-- leitura (`last_read_message_id`) e o historico do que foi enviado ao cliente.
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "occurrence_conversations" WHERE "participant" = 'client')
     OR EXISTS (SELECT 1 FROM "occurrence_conversation_messages" WHERE "client_delivery_id" IS NOT NULL) THEN
    RAISE EXCEPTION 'Refusing to drop the client conversation: client conversations exist';
  END IF;
END
$$;

-- IF EXISTS: o rollback de uma migration mais antiga que recria a tabela da entrega leva o gatilho junto.
DROP TRIGGER IF EXISTS "occurrence_client_conversation_sync_trigger" ON "occurrence_contractor_reply_deliveries";
DROP FUNCTION IF EXISTS "sync_occurrence_client_conversation"();
ALTER TABLE "occurrence_conversations" DROP CONSTRAINT "occurrence_conversations_participant_shape_check", ADD CONSTRAINT "occurrence_conversations_participant_shape_check" CHECK (("participant" = 'contractor' and "contractor_id" is not null and "public_ref" is not null and "driver_user_id" is null)
        or ("participant" = 'driver' and "driver_user_id" is not null and "contractor_id" is null and "public_ref" is null));
ALTER TABLE "occurrence_conversations" DROP CONSTRAINT "occurrence_conversations_participant_check", ADD CONSTRAINT "occurrence_conversations_participant_check" CHECK ("participant" in ('contractor', 'driver'));
ALTER TABLE "occurrence_conversations" DROP CONSTRAINT "occurrence_conversations_client_tax_id_check";
ALTER TABLE "occurrence_conversation_messages" DROP CONSTRAINT "occurrence_conversation_messages_client_delivery_check";
DROP INDEX "occurrence_conversation_messages_client_delivery_unique";
ALTER TABLE "occurrence_conversations" DROP COLUMN "client_tax_id";
ALTER TABLE "occurrence_conversation_messages" DROP COLUMN "recipient_address";
ALTER TABLE "occurrence_conversation_messages" DROP COLUMN "client_delivery_id";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261027232931_occurrence_client_conversation';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one occurrence_client_conversation journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
