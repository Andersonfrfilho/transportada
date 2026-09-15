-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Remove 'helper' da lista de parcelas do resultado financeiro congelado (spec 149 T6).
--
-- ⚠️ Viagem já congelada com parcela 'helper' quebra este rollback (a constraint estreitada não
-- aceita a linha existente) — apague ou migre essas linhas antes em ambiente com uso real.
BEGIN;

ALTER TABLE "trip_financial_parcels"
  DROP CONSTRAINT "trip_financial_parcels_kind_check",
  ADD CONSTRAINT "trip_financial_parcels_kind_check"
    CHECK ("kind" in ('driver', 'fuel', 'other_per_kilometer', 'delivery_charges', 'toll', 'manual', 'icms', 'pis_cofins'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260915110748_trip_helper_financial_kind';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_helper_financial_kind journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
