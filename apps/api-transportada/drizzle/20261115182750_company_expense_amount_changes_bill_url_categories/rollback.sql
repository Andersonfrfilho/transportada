-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 329: remove o histórico de valores das contas e o link do boleto.
--
-- ⚠️ Só com aprovação humana. Recusa-se a rodar quando há mudança de valor registrada ou conta com link: é histórico do dono e não volta sozinho.
-- As cinco categorias semeadas (consumo, internet/telefone, financiamentos) ficam: podem já ter conta lançada.
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  recorded_changes integer;
  links integer;
BEGIN
  SELECT count(*) INTO recorded_changes FROM "company_expense_amount_changes";
  SELECT count(*) INTO links FROM "company_expenses" WHERE "bill_url" IS NOT NULL;
  IF recorded_changes > 0 OR links > 0 THEN
    RAISE EXCEPTION 'amount changes (%) or bill links (%) exist; refusing to drop the spec 329 structures', recorded_changes, links;
  END IF;
END
$$;

DROP TABLE "company_expense_amount_changes";
ALTER TABLE "company_expenses" DROP COLUMN "bill_url";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261115182750_company_expense_amount_changes_bill_url_categories';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one company_expense_amount_changes_bill_url_categories journal entry, removed %', deleted_migrations;
  END IF;
END
$$;

COMMIT;
