-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverts the configurable xDetRetira column on cte_emission_profiles.
-- Destructive: every per-profile pickup detail is discarded and the CT-e payload stops carrying
-- xDetRetira; retira keeps coming from the existing pickup_indicator column.
BEGIN;

ALTER TABLE "cte_emission_profiles"
  DROP CONSTRAINT "cte_emission_profiles_pickup_details_check",
  DROP COLUMN "pickup_details";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260728015716_cte_pickup_details'
      AND "hash" = 'de7f30ef3f020d200d0b261eb5cb88ebe8eda8a83d2b39b946c4f5888f0954d6';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one cte_pickup_details migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
