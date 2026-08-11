-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Drops the self-recovery bookkeeping from nfe_distribution_cursors.
-- Perde-se o rastro de recusas seguidas e do último intervalo de NSU abandonado; o cursor em si
-- (ult_nsu, max_nsu, next_allowed_at) fica intacto, então a busca continua de onde parou.
BEGIN;

ALTER TABLE "nfe_distribution_cursors"
  DROP COLUMN IF EXISTS "last_skipped_at",
  DROP COLUMN IF EXISTS "last_skipped_to_nsu",
  DROP COLUMN IF EXISTS "last_skipped_from_nsu",
  DROP COLUMN IF EXISTS "consecutive_rate_limits";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260811140230_nfe_distribution_cursor_recovery'
      AND "hash" = 'e846d721ca6f7bcabf2bfd5b6acc29c8b5b1594d3ba03c66f716d111e416a2dc';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one nfe_distribution_cursor_recovery migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
