-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Drops the aggregate account table (self-service portal login for aggregates).
BEGIN;

DROP TABLE IF EXISTS "aggregate_accounts";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260825172715_polite_carlie_cooper'
      AND "hash" = 'bb9ae84b23f0851a99ecd73ce837d207f26ca9387c8a51e2d6f8b7efff9f7e80';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one polite_carlie_cooper migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
