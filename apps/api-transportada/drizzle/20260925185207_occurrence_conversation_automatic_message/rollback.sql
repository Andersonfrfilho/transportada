-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 183 T802: a coluna `automatic` de `occurrence_conversation_messages` e o CHECK de
-- autor que aceita a enviada sem autor quando ela é o aviso automático do tipo.
--
-- ⚠️ Recusa rodar se já houver aviso automático gravado: voltar o CHECK antigo exigiria apagar ou
-- inventar um autor para mensagens que a contratante já recebeu. Histórico não se reescreve aqui.
BEGIN;

DO $$
DECLARE
  automatic_messages integer;
BEGIN
  SELECT count(*) INTO automatic_messages
    FROM "occurrence_conversation_messages" WHERE "automatic";
  IF automatic_messages > 0 THEN
    RAISE EXCEPTION 'Refusing rollback: % automatic occurrence conversation message(s) exist',
      automatic_messages;
  END IF;
END
$$;

ALTER TABLE "occurrence_conversation_messages" DROP CONSTRAINT "occurrence_conversation_messages_author_check",
  ADD CONSTRAINT "occurrence_conversation_messages_author_check" CHECK (("direction" = 'outbound' and "author_user_id" is not null and "driver_user_id" is null and "sender_address" is null and "contractor_contact_id" is null)
        or ("direction" = 'inbound' and num_nonnulls("author_user_id", "driver_user_id", "sender_address") = 1
          and ("author_user_id" is null or "channel" = 'portal')
          and ("sender_address" is null or "channel" in ('email', 'whatsapp'))));
ALTER TABLE "occurrence_conversation_messages" DROP COLUMN "automatic";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260925185207_occurrence_conversation_automatic_message';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one occurrence_conversation_automatic_message journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
