-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 328: remove "onde a conta está" e "quem causou" (usuário do escritório) de company_expenses.
--
-- ⚠️ Só com aprovação humana. Recusa-se a rodar quando alguma conta tem um dos dois preenchidos: é dado do dono.
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  filled_expenses integer;
BEGIN
  SELECT count(*) INTO filled_expenses FROM "company_expenses"
    WHERE "bill_location" IS NOT NULL OR "caused_by_user_id" IS NOT NULL OR "caused_by_name" IS NOT NULL;
  IF filled_expenses > 0 THEN
    RAISE EXCEPTION 'company expenses with a bill location or a user/named cause exist (% rows); refusing to drop the spec 328 columns',
      filled_expenses;
  END IF;
END
$$;

ALTER TABLE "company_expenses" DROP CONSTRAINT "company_expenses_single_cause_check";
ALTER TABLE "company_expenses" DROP COLUMN "caused_by_name";
ALTER TABLE "company_expenses" DROP COLUMN "caused_by_user_id";
ALTER TABLE "company_expenses" DROP COLUMN "bill_location";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261115155414_company_expense_bill_location_and_user_cause';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one company_expense_bill_location_and_user_cause journal entry, removed %', deleted_migrations;
  END IF;
END
$$;

COMMIT;
