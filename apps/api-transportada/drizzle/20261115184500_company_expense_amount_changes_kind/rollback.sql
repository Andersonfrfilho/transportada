-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 329: remove a coluna `kind` do histórico de valores.
--
-- ⚠️ Só com aprovação humana. Recusa-se a rodar quando há correção registrada: perder o `kind` apagaria a distinção.
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  corrections integer;
BEGIN
  SELECT count(*) INTO corrections FROM "company_expense_amount_changes" WHERE "kind" = 'correction';
  IF corrections > 0 THEN
    RAISE EXCEPTION 'corrections (%) exist; refusing to drop the kind column', corrections;
  END IF;
END
$$;

ALTER TABLE "company_expense_amount_changes" DROP CONSTRAINT "company_expense_amount_changes_kind_check";
ALTER TABLE "company_expense_amount_changes" DROP COLUMN "kind";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261115184500_company_expense_amount_changes_kind';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one company_expense_amount_changes_kind journal entry, removed %', deleted_migrations;
  END IF;
END
$$;

COMMIT;
