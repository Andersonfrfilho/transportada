-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 330: remove a modalidade funcionário (pessoa e vínculo) das contas.
--
-- ⚠️ Só com aprovação humana. Recusa-se a rodar quando alguma conta já aponta funcionário ou vínculo: é dado do dono.
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  filled integer;
BEGIN
  SELECT count(*) INTO filled FROM "company_expenses"
    WHERE "employee_driver_id" IS NOT NULL OR "employee_user_id" IS NOT NULL
      OR "employee_name" IS NOT NULL OR "employment_type" IS NOT NULL;
  IF filled > 0 THEN
    RAISE EXCEPTION 'expenses with employee data (%) exist; refusing to drop the spec 330 columns', filled;
  END IF;
END
$$;

ALTER TABLE "company_expenses" DROP CONSTRAINT "company_expenses_employment_type_check";
ALTER TABLE "company_expenses" DROP CONSTRAINT "company_expenses_single_employee_check";
ALTER TABLE "company_expenses" DROP CONSTRAINT "company_expenses_employee_user_fk";
ALTER TABLE "company_expenses" DROP CONSTRAINT "company_expenses_employee_driver_fk";
ALTER TABLE "company_expenses" DROP COLUMN "employment_type";
ALTER TABLE "company_expenses" DROP COLUMN "employee_name";
ALTER TABLE "company_expenses" DROP COLUMN "employee_user_id";
ALTER TABLE "company_expenses" DROP COLUMN "employee_driver_id";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261115185401_company_expense_employee';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one company_expense_employee journal entry, removed %', deleted_migrations;
  END IF;
END
$$;

COMMIT;
