-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz a spec 169 (RF1, RF2): a receita da viagem e o cadastro de espécies deixam de existir.
--
-- O que se perde: **toda** receita lançada (`trip_revenue_entries`) e todas as espécies
-- cadastradas, inclusive as que a própria migration semeou (Pedágio, Avulso). O gasto volta a
-- classificar-se pelo enum fixo do código, que é como ele funcionava antes desta spec. As tabelas
-- são criadas por esta migration, então apagá-las é o único rollback possível — e por isso este
-- arquivo nunca roda em produção sem backup conferido.

BEGIN;

DROP TABLE "trip_revenue_entries";
DROP TABLE "company_entry_kinds";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260923032453_flimsy_metal_master';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one flimsy_metal_master migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
