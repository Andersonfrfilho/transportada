-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverts the configurable CT-e retry policy columns on company_fiscal_profiles.
-- Destructive: every per-company retry configuration is discarded and the issuance falls back to
-- the hardcoded defaults (3 attempts, 5s/30s/300s backoff).
BEGIN;

ALTER TABLE "company_fiscal_profiles"
  DROP CONSTRAINT "company_fiscal_profiles_cte_retry_max_attempts_check",
  DROP CONSTRAINT "company_fiscal_profiles_cte_retry_backoff_check",
  DROP COLUMN "cte_retry_backoff_seconds",
  DROP COLUMN "cte_retry_max_attempts";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260727213825_cte_retry_policy'
      AND "hash" = '6bf33c666ffbe9ccb7652c21f27b52cfded5bc541d5f1053742ca4fe35779a60';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one cte_retry_policy migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
