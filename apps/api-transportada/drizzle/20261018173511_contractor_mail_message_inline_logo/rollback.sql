-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Tira o marcador de logo embutido da mensagem; o HTML já gravado não muda.
BEGIN;

SET LOCAL lock_timeout = '3s';

ALTER TABLE "contractor_mail_messages" DROP CONSTRAINT IF EXISTS "contractor_mail_messages_has_inline_logo_direction_check";

ALTER TABLE "contractor_mail_messages" DROP COLUMN "has_inline_logo";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261018173511_contractor_mail_message_inline_logo';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one contractor_mail_message_inline_logo journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
