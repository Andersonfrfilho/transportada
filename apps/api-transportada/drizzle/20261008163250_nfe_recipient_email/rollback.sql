-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz o e-mail do destinatário da nota: a CHECK cai primeiro, depois a coluna. Sem CASCADE.
-- O que se perde: os e-mails gravados; o XML original segue guardado e o backfill os relê.

BEGIN;

ALTER TABLE "nfe_documents"
  DROP CONSTRAINT IF EXISTS "nfe_documents_recipient_email_check";

ALTER TABLE "nfe_documents"
  DROP COLUMN IF EXISTS "recipient_email";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261008163250_nfe_recipient_email';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one nfe_recipient_email journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
