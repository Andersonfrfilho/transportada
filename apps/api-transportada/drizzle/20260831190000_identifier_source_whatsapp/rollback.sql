-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Remove a origem do identificador e a marca de WhatsApp.
--
-- ⚠️ Os identificadores acrescentados à mão **permanecem**, mas deixam de ser distinguíveis dos
-- derivados da ficha — e a primeira gravação de perfil depois disso os apaga, porque a reconstrução
-- volta a substituir o conjunto inteiro. Quem reverter isto perde o segundo e-mail de cada pessoa na
-- próxima edição do cadastro dela.
BEGIN;

ALTER TABLE "login_identifiers" DROP CONSTRAINT IF EXISTS "login_identifiers_whatsapp_kind_check";
ALTER TABLE "login_identifiers" DROP CONSTRAINT IF EXISTS "login_identifiers_source_check";
ALTER TABLE "login_identifiers" DROP COLUMN IF EXISTS "is_whatsapp";
ALTER TABLE "login_identifiers" DROP COLUMN IF EXISTS "source";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260831190000_identifier_source_whatsapp';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one identifier_source_whatsapp journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
