-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverts the aggregate driver application table (spec 053).
-- Destructive: dropping the table discards every candidatura submitted through the public landing
-- form that the operator has not yet approved or rejected — the candidate would need to resubmit.
BEGIN;

DROP TABLE IF EXISTS "aggregate_applications";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260825122857_aggregate_applications'
      AND "hash" = '94deeddaf31c03eb5c51a4d9caed163864ae9ff46f36fb43f4fda6a5d522cb68';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one aggregate_applications migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
