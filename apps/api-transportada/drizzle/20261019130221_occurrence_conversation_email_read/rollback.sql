-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Recria a CHECK que proíbe `email` em `read`. Recusa se já houver mensagem de e-mail lida: não reescreve dado.
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "occurrence_conversation_messages"
      WHERE "channel" = 'email' AND "status" = 'read'
  ) THEN
    RAISE EXCEPTION 'rollback recusado: existem mensagens de e-mail em status read (spec 274)';
  END IF;
END
$$;

ALTER TABLE "occurrence_conversation_messages" ADD CONSTRAINT "occurrence_conversation_messages_email_never_read_check" CHECK ("channel" <> 'email' or "status" is null or "status" <> 'read');

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261019130221_occurrence_conversation_email_read';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one occurrence_conversation_email_read journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
