-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 325 T1.4b: remove a tabela das viagens do pagamento.
--
-- ⚠️ Só com aprovação humana. Recusa-se a rodar com viagem incluída em pagamento: é o único registro de quais viagens
-- cada pagamento cobriu.
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  stored_trips integer;
BEGIN
  SELECT count(*) INTO stored_trips FROM "company_expense_occurrence_trips";
  IF stored_trips > 0 THEN
    RAISE EXCEPTION 'company_expense_occurrence_trips has % rows; refusing to drop the spec 325 T1.4b table',
      stored_trips;
  END IF;
END
$$;

DROP TABLE "company_expense_occurrence_trips";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261113201600_company_expense_occurrence_trips';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one company_expense_occurrence_trips journal entry, removed %', deleted_migrations;
  END IF;
END
$$;

COMMIT;
