-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverts the table that stores the carrier logo printed in the invoice PDF header.
-- Destructive: dropping the table discards the image each tenant uploaded, and the invoice PDF
-- silently goes back to a header without the carrier brand.
BEGIN;

DROP TABLE IF EXISTS "company_logos";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260801043234_company_logos'
      AND "hash" = 'd33d6b031bace3f263a730891c01e31afb29a2c610c388cc7f1d807156897d10';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one company_logos migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
