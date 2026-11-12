-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 313: remove a restrição por contratante gravada na importação por e-mail.
--
-- ⚠️ Só com aprovação humana. Recusa-se a rodar com restrição gravada: apagar a coluna perde de quem a importação devia vir.
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  restricted_imports integer;
BEGIN
  SELECT count(*) INTO restricted_imports FROM "nfe_imports" WHERE "restricted_contractor_id" IS NOT NULL;
  IF restricted_imports > 0 THEN
    RAISE EXCEPTION 'nfe_imports has % restricted rows; refusing to drop restricted_contractor_id', restricted_imports;
  END IF;
END
$$;

ALTER TABLE "nfe_imports" DROP CONSTRAINT "nfe_imports_restricted_contractor_id_contractors_id_fkey";
ALTER TABLE "nfe_imports" DROP COLUMN "restricted_contractor_id";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261109222719_nfe_import_restricted_contractor';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one nfe_import_restricted_contractor journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
