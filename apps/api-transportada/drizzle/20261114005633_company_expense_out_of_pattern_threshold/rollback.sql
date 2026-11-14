-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 325 T6.3: remove o limite do alerta de "fora do padrão" de `company_expense_allocation_settings`.
--
-- ⚠️ Só com aprovação humana. Recusa-se a rodar quando alguma empresa trocou o limite (valor diferente de 10): é escolha
-- do dono, e não volta sozinha.
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  customized integer;
BEGIN
  SELECT count(*) INTO customized
  FROM "company_expense_allocation_settings"
  WHERE "out_of_pattern_threshold_percent" <> 10;
  IF customized > 0 THEN
    RAISE EXCEPTION 'out-of-pattern threshold was customized (% rows); refusing to drop the spec 325 T6.3 column',
      customized;
  END IF;
END
$$;

ALTER TABLE "company_expense_allocation_settings"
  DROP CONSTRAINT "company_expense_allocation_settings_threshold_check";
ALTER TABLE "company_expense_allocation_settings" DROP COLUMN "out_of_pattern_threshold_percent";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261114005633_company_expense_out_of_pattern_threshold';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one company_expense_out_of_pattern_threshold journal entry, removed %', deleted_migrations;
  END IF;
END
$$;

COMMIT;
