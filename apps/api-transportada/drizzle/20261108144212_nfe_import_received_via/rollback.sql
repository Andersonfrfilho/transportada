-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 301 T1.1: remove o canal e o remetente da importação de XML.
--
-- ⚠️ Só com aprovação humana. Apagar `received_via`/`received_from` perde de onde cada importação veio
-- (e-mail, WhatsApp); depois de haver importação por esses canais em produção, prefira roll-forward.
BEGIN;

SET LOCAL lock_timeout = '3s';

ALTER TABLE "nfe_imports" DROP CONSTRAINT IF EXISTS "nfe_imports_received_from_check";
ALTER TABLE "nfe_imports" DROP CONSTRAINT IF EXISTS "nfe_imports_received_via_check";
ALTER TABLE "nfe_imports" DROP COLUMN IF EXISTS "received_from";
ALTER TABLE "nfe_imports" DROP COLUMN IF EXISTS "received_via";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261108144212_nfe_import_received_via';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one nfe_import_received_via journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
