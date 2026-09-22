-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 150 T302: `contractor_mail_messages.body_html` e as duas CHECKs dela.
--
-- Apaga o HTML já gravado das mensagens de saída; o `body_text` fica, e é ele que o worker de antes
-- da T302 envia. Rode só junto com a volta do worker para a versão anterior.
BEGIN;

ALTER TABLE "contractor_mail_messages"
  DROP CONSTRAINT IF EXISTS "contractor_mail_messages_body_html_size_check";

ALTER TABLE "contractor_mail_messages"
  DROP CONSTRAINT IF EXISTS "contractor_mail_messages_body_html_direction_check";

ALTER TABLE "contractor_mail_messages"
  DROP COLUMN IF EXISTS "body_html";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260915200000_contractor_mail_body_html';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one contractor_mail_body_html journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
