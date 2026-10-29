-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Volta as colunas do texto livre do retorno (spec 248), vazias. O texto antigo se perde na migration: o
-- boleto ao cliente passou para os modelos do módulo de notificação (spec 286), então o rollback não o recupera.
BEGIN;

SET LOCAL lock_timeout = '3s';

ALTER TABLE "company_occurrence_types" ADD COLUMN "forward_email_subject" text DEFAULT '' NOT NULL;
ALTER TABLE "company_occurrence_types" ADD COLUMN "forward_email_body" text DEFAULT '' NOT NULL;
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_forward_email_subject_check" CHECK (char_length("forward_email_subject") <= 200);
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_forward_email_body_check" CHECK (char_length("forward_email_body") <= 4000);
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_forward_needs_text_check" CHECK (("forward_to_note_recipient" = 'off' and "forward_to_informed_email" = 'off') or (btrim("forward_email_subject") <> '' and btrim("forward_email_body") <> ''));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261029190000_occurrence_drop_forward_email';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one occurrence_drop_forward_email journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
