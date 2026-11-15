-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 328: remove a coluna "quem causou a conta" de company_expenses.
--
-- ⚠️ Só com aprovação humana. Recusa-se a rodar quando alguma conta tem causador: é dado do dono e não volta sozinho.
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  caused_expenses integer;
BEGIN
  SELECT count(*) INTO caused_expenses FROM "company_expenses" WHERE "caused_by_driver_id" IS NOT NULL;
  IF caused_expenses > 0 THEN
    RAISE EXCEPTION 'company expenses with a cause exist (% rows); refusing to drop the spec 328 caused_by_driver_id column',
      caused_expenses;
  END IF;
END
$$;

ALTER TABLE "company_expenses" DROP CONSTRAINT "company_expenses_caused_by_driver_fk";
DROP INDEX "company_expenses_caused_by_driver_idx";
ALTER TABLE "company_expenses" DROP COLUMN "caused_by_driver_id";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261115154136_company_expense_caused_by';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one company_expense_caused_by journal entry, removed %', deleted_migrations;
  END IF;
END
$$;

COMMIT;
