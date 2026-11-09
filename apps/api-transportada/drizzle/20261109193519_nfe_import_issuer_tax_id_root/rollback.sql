-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 314: a importação passa a guardar a raiz do CNPJ do emitente que aceita (domínio amarrado a contratante).
--
-- ⚠️ Só com aprovação humana. Voltar faz a importação ainda em fila aceitar qualquer emitente.
BEGIN;

SET LOCAL lock_timeout = '3s';

ALTER TABLE "nfe_imports" DROP COLUMN "issuer_tax_id_root";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261109193519_nfe_import_issuer_tax_id_root';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one nfe_import_issuer_tax_id_root journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
