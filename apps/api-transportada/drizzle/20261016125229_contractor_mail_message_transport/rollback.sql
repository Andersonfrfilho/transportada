-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Tira a coluna `transport` de `contractor_mail_messages`.
-- ⚠️ Recusa rodar enquanto houver mensagem `sandbox_smtp` ainda na fila: sem a coluna o worker a mandaria
-- pelo Resend. Confira antes: select id from contractor_mail_messages where transport = 'sandbox_smtp' and delivery_status = 'queued';
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  queued_sandbox_messages integer;
BEGIN
  SELECT count(*) INTO queued_sandbox_messages
    FROM "contractor_mail_messages"
    WHERE "transport" = 'sandbox_smtp' AND "delivery_status" = 'queued';

  IF queued_sandbox_messages > 0 THEN
    RAISE EXCEPTION 'Refusing to roll back: % sandbox message(s) are still queued and would go through Resend',
      queued_sandbox_messages;
  END IF;
END
$$;

ALTER TABLE "contractor_mail_messages" DROP CONSTRAINT "contractor_mail_messages_transport_check";
ALTER TABLE "contractor_mail_messages" DROP COLUMN "transport";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261016125229_contractor_mail_message_transport';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one contractor_mail_message_transport journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
