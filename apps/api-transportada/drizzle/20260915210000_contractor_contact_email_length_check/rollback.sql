-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a revisão final da spec 150, item de segurança B1: a CHECK
-- `contractor_contacts_email_length_check`. Não apaga dado nenhum — só a trava contra e-mail
-- acima de 254 caracteres, que a fronteira HTTP (`contractor-contacts.routes.ts`, `.max(254)`)
-- continua aplicando de qualquer forma.
BEGIN;

ALTER TABLE "contractor_contacts"
  DROP CONSTRAINT IF EXISTS "contractor_contacts_email_length_check";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260915210000_contractor_contact_email_length_check';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one contractor_contact_email_length_check journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
