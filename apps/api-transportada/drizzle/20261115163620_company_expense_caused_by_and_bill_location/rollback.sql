-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 328: remove "quem causou a conta" e "onde a conta está" de company_expenses.
--
-- ⚠️ Só com aprovação humana. Recusa-se a rodar quando alguma conta tem um dos campos preenchidos: é dado do dono e não volta sozinho.
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  filled_expenses integer;
BEGIN
  SELECT count(*) INTO filled_expenses FROM "company_expenses"
    WHERE "caused_by_driver_id" IS NOT NULL
       OR "caused_by_user_id" IS NOT NULL
       OR "caused_by_name" IS NOT NULL
       OR "bill_location" IS NOT NULL;
  IF filled_expenses > 0 THEN
    RAISE EXCEPTION 'company expenses with a cause or a bill location exist (% rows); refusing to drop the spec 328 columns',
      filled_expenses;
  END IF;
END
$$;

ALTER TABLE "company_expenses" DROP CONSTRAINT "company_expenses_single_cause_check";
ALTER TABLE "company_expenses" DROP CONSTRAINT "company_expenses_caused_by_driver_fk";
DROP INDEX "company_expenses_caused_by_driver_idx";
ALTER TABLE "company_expenses" DROP COLUMN "caused_by_name";
ALTER TABLE "company_expenses" DROP COLUMN "caused_by_user_id";
ALTER TABLE "company_expenses" DROP COLUMN "caused_by_driver_id";
ALTER TABLE "company_expenses" DROP COLUMN "bill_location";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261115163620_company_expense_caused_by_and_bill_location';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one company_expense_caused_by_and_bill_location journal entry, removed %', deleted_migrations;
  END IF;
END
$$;

COMMIT;
