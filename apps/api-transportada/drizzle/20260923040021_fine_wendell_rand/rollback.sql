-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz a spec 169 (RF5, RF12, RF13): o gasto volta a não ter espécie cadastrada, e remover um
-- lançamento volta a não existir.
--
-- O que se perde: a espécie escolhida em cada gasto (`entry_kind_id`) e a marca de remoção de
-- gastos e receitas. Um lançamento removido depois desta migration e antes do rollback **volta a
-- aparecer** na lista e na soma, porque a coluna que o escondia deixa de existir — não há como
-- preservar essa informação sem a coluna. A ida é aditiva, então nada mais é perdido.

BEGIN;

ALTER TABLE "trip_revenue_entries" DROP CONSTRAINT "trip_revenue_entries_removed_check";
ALTER TABLE "trip_cost_entries" DROP CONSTRAINT "trip_cost_entries_removed_check";
ALTER TABLE "trip_cost_entries" DROP CONSTRAINT "trip_cost_entries_entry_kind_fk";

ALTER TABLE "trip_revenue_entries" DROP COLUMN "removed_by_user_id";
ALTER TABLE "trip_revenue_entries" DROP COLUMN "removed_at";
ALTER TABLE "trip_cost_entries" DROP COLUMN "removed_by_user_id";
ALTER TABLE "trip_cost_entries" DROP COLUMN "removed_at";
ALTER TABLE "trip_cost_entries" DROP COLUMN "entry_kind_id";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260923040021_fine_wendell_rand';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one fine_wendell_rand migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
