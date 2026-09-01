-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverts the per-CNPJ-root landing configuration table (brand, contacts, accent color, sections).
-- Destructive: dropping the table discards whatever each group already configured for its landing
-- page, and the app falls back to the built-in defaults on the next read.
BEGIN;

DROP TABLE IF EXISTS "landing_settings";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260825121044_landing_settings'
      AND "hash" = 'ae7d82fa4fe3817547c113d971d02c1f80d1556c5bb0e210efb8fe7bdee75207';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one landing_settings migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
