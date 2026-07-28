-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Drops the per-user view_preferences table. Stored table-view configuration
-- is disposable UI state, so this rollback is always safe to run.
BEGIN;

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260724220724_view_preferences'
      AND "hash" = 'd0d0066853788bca63514e6345f187c8368ff81e869ca8202a68a12763c43594';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one view_preferences migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

DROP TABLE "view_preferences";

COMMIT;
