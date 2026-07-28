-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverts the CT-e emission profile parameterization: the profile header plus its
-- tax-id matchers and priced charge components. Purely additive migration — nothing
-- outside these three tables was touched, so the drop is self-contained. Dependents
-- are dropped before the profile they reference, never with CASCADE. Destructive to
-- any profile an operator already configured; export cte_emission_profiles,
-- cte_emission_profile_matchers and cte_emission_profile_components before running.
BEGIN;

DROP TABLE "cte_emission_profile_components";
DROP TABLE "cte_emission_profile_matchers";
DROP TABLE "cte_emission_profiles";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260727114820_cte_emission_profiles'
      AND "hash" = '86f9672dff874cbefd2769fc7fe0e1273a8dcf881f0f6b8741933e552b37d6e9';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one cte_emission_profiles migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
