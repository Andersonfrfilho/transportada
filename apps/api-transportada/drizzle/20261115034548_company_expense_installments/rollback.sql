-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 325 (extensão "parcelas"): remove o total de parcelas da conta e o número da parcela da ocorrência.
--
-- ⚠️ Só com aprovação humana. Recusa-se a rodar quando alguma conta tem total de parcelas: é dado do dono e não volta sozinho.
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  installment_expenses integer;
BEGIN
  SELECT count(*) INTO installment_expenses FROM "company_expenses" WHERE "installments_total" IS NOT NULL;
  IF installment_expenses > 0 THEN
    RAISE EXCEPTION 'company expenses with installments exist (% rows); refusing to drop the spec 325 installments columns',
      installment_expenses;
  END IF;
END
$$;

ALTER TABLE "company_expenses" DROP CONSTRAINT "company_expenses_installments_check";
ALTER TABLE "company_expenses" DROP COLUMN "installments_total";
ALTER TABLE "company_expense_occurrences" DROP COLUMN "installment_number";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261115034548_company_expense_installments';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one company_expense_installments journal entry, removed %', deleted_migrations;
  END IF;
END
$$;

COMMIT;
