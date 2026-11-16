-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 325 T1.2: remove as tabelas do módulo Contas.
--
-- ⚠️ Só com aprovação humana. Recusa-se a rodar com conta ou ocorrência gravada: são o único registro do que a empresa
-- cadastrou e pagou. As categorias semeadas não contam (só as linhas de conta/ocorrência).
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  stored_expenses integer;
  stored_occurrences integer;
BEGIN
  SELECT count(*) INTO stored_expenses FROM "company_expenses";
  SELECT count(*) INTO stored_occurrences FROM "company_expense_occurrences";
  IF stored_expenses > 0 OR stored_occurrences > 0 THEN
    RAISE EXCEPTION 'company_expenses has % rows and company_expense_occurrences has %; refusing to drop the spec 325 T1.2 tables',
      stored_expenses, stored_occurrences;
  END IF;
END
$$;

DROP TABLE "company_expense_occurrences";
DROP TABLE "company_expenses";
DROP TABLE "company_expense_categories";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261113175316_company_expenses';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one company_expenses journal entry, removed %', deleted_migrations;
  END IF;
END
$$;

COMMIT;
