-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 331: remove os tipos dentro da categoria e a coluna `subtype_id` das contas.
--
-- ⚠️ Só com aprovação humana. Recusa-se a rodar quando há tipo cadastrado: é dado do dono.
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  subtypes integer;
BEGIN
  SELECT count(*) INTO subtypes FROM "company_expense_subtypes";
  IF subtypes > 0 THEN
    RAISE EXCEPTION 'subtypes (%) exist; refusing to drop the spec 331 structures', subtypes;
  END IF;
END
$$;

ALTER TABLE "company_expenses" DROP CONSTRAINT "company_expenses_subtype_fk";
DROP INDEX "company_expenses_subtype_idx";
ALTER TABLE "company_expenses" DROP COLUMN "subtype_id";
DROP TABLE "company_expense_subtypes";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261115192622_company_expense_subtypes';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one company_expense_subtypes journal entry, removed %', deleted_migrations;
  END IF;
END
$$;

COMMIT;
