-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverts the predominant product mode chosen by highest commercial quantity (ADR-0019).
-- Destructive: the constraint goes back to rejecting 'highest_quantity', so any emission profile
-- already saved in that mode makes the ALTER fail. Decide what those profiles become before running.
BEGIN;

ALTER TABLE "cte_emission_profiles" DROP CONSTRAINT "cte_emission_profiles_predominant_product_mode_check",
  ADD CONSTRAINT "cte_emission_profiles_predominant_product_mode_check" CHECK ("predominant_product_mode" in ('highest_value', 'highest_weight', 'fixed'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260729182304_cte_predominant_product_highest_quantity'
      AND "hash" = '7a8d513467d9b2da7c708b5b0c79dc8dc2571ff9fe95c577d100176d1c4096c1';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one cte_predominant_product_highest_quantity migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
