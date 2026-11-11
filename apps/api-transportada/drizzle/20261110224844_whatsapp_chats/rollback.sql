-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 319 T2: remove a caixa de conversas do WhatsApp e o prazo de devolução por empresa.
--
-- ⚠️ Só com aprovação humana. Recusa-se a rodar com chat ou mensagem gravados (o histórico do atendente é o único
-- registro do que foi dito pelo número do bot) ou com prazo de devolução alterado por alguma empresa.
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  stored_chats integer;
  stored_messages integer;
  changed_timeouts integer;
BEGIN
  SELECT count(*) INTO stored_chats FROM "whatsapp_chats";
  IF stored_chats > 0 THEN
    RAISE EXCEPTION 'whatsapp_chats has % rows; refusing to drop the spec 319 T2 tables', stored_chats;
  END IF;
  SELECT count(*) INTO stored_messages FROM "whatsapp_chat_messages";
  IF stored_messages > 0 THEN
    RAISE EXCEPTION 'whatsapp_chat_messages has % rows; refusing to drop the spec 319 T2 tables', stored_messages;
  END IF;
  SELECT count(*) INTO changed_timeouts FROM "whatsapp_evolution_settings"
    WHERE "chat_takeover_timeout_seconds" <> 1800;
  IF changed_timeouts > 0 THEN
    RAISE EXCEPTION 'whatsapp_evolution_settings has % companies with a custom chat takeover timeout; refusing to drop the spec 319 T2 column', changed_timeouts;
  END IF;
END
$$;

DROP TABLE "whatsapp_chat_messages";
DROP TABLE "whatsapp_chats";
ALTER TABLE "whatsapp_evolution_settings" DROP CONSTRAINT "whatsapp_evolution_settings_chat_takeover_timeout_check";
ALTER TABLE "whatsapp_evolution_settings" DROP COLUMN "chat_takeover_timeout_seconds";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261110224844_whatsapp_chats';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one whatsapp_chats journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
