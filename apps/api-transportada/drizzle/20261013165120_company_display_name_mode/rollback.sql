-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Remove a escolha do nome exibido da empresa (`display_name_mode`).
--
-- Perde só a preferência: `legal_name` e `trade_name` ficam intactos, e o código anterior já exibia fantasia com
-- fallback para a razão social, que é o padrão desta coluna.
BEGIN;

SET LOCAL lock_timeout = '3s';

ALTER TABLE "company_fiscal_profiles" DROP CONSTRAINT IF EXISTS "company_fiscal_profiles_display_name_mode_check";
ALTER TABLE "company_fiscal_profiles" DROP COLUMN IF EXISTS "display_name_mode";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261013165120_company_display_name_mode';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one company_display_name_mode journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
