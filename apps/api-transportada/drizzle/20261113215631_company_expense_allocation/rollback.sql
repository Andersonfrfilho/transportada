-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 325 T4.3: remove o grupo de custo da categoria e a tabela do critério de rateio.
--
-- ⚠️ Só com aprovação humana. Recusa-se a rodar quando alguma empresa trocou o critério de rateio (linha diferente do
-- padrão) ou classificou uma categoria fora da semente: é escolha do dono, e não volta sozinha.
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  changed_settings integer;
  changed_categories integer;
BEGIN
  SELECT count(*) INTO changed_settings
  FROM "company_expense_allocation_settings"
  WHERE ("cost_group", "criterion") NOT IN (
    ('vehicle_fixed', 'per_km'), ('per_km', 'per_km'), ('administrative', 'per_revenue')
  );
  SELECT count(*) INTO changed_categories
  FROM "company_expense_categories"
  WHERE ("name", "cost_group") NOT IN (
    ('Aluguel', 'administrative'), ('Folha', 'administrative'), ('Impostos', 'administrative'),
    ('Outros', 'administrative'), ('Seguro', 'vehicle_fixed'), ('Manutenção', 'per_km'),
    ('Combustível', 'per_km'), ('Pagamento de motorista/agregado', 'in_trip')
  ) AND ("cost_group" <> 'administrative' OR "name" IN (
    'Aluguel', 'Folha', 'Impostos', 'Outros', 'Seguro', 'Manutenção', 'Combustível',
    'Pagamento de motorista/agregado'
  ));
  IF changed_settings > 0 OR changed_categories > 0 THEN
    RAISE EXCEPTION 'allocation config was customized (% settings, % categories); refusing to drop the spec 325 T4.3 columns',
      changed_settings, changed_categories;
  END IF;
END
$$;

DROP TABLE "company_expense_allocation_settings";

ALTER TABLE "company_expense_categories" DROP CONSTRAINT "company_expense_categories_cost_group_check";
ALTER TABLE "company_expense_categories" DROP COLUMN "cost_group";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261113215631_company_expense_allocation';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one company_expense_allocation journal entry, removed %', deleted_migrations;
  END IF;
END
$$;

COMMIT;
