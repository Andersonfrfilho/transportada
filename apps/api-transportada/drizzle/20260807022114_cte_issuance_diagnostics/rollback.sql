-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverts cte_issuance_diagnostics.
-- Destructive, but the table is auxiliary and expires by design: dropping it loses only the
-- request/response trail of CT-e issuance attempts. No fiscal document lives here.
BEGIN;

DROP TABLE IF EXISTS "cte_issuance_diagnostics";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260807022114_cte_issuance_diagnostics'
      AND "hash" = 'baecb19a155f75a12af98dcdd40845a38996929d83abe8d4e9e4875c71297b50';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one cte_issuance_diagnostics migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
