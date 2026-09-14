-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a correção pós-entrega da T009 (spec 143): `subject`/`to_addresses` em
-- `contractor_mail_messages`. Aditiva e segura a qualquer momento — nenhuma linha de
-- `contractor_mail_messages` existe em produção ainda (a feature não foi lançada).
BEGIN;

ALTER TABLE "contractor_mail_messages"
  DROP CONSTRAINT IF EXISTS "contractor_mail_messages_to_addresses_check";

ALTER TABLE "contractor_mail_messages"
  DROP CONSTRAINT IF EXISTS "contractor_mail_messages_subject_check";

ALTER TABLE "contractor_mail_messages"
  DROP COLUMN IF EXISTS "to_addresses";

ALTER TABLE "contractor_mail_messages"
  DROP COLUMN IF EXISTS "subject";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260913191809_contractor_mail_message_recipient';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one contractor_mail_message_recipient journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
