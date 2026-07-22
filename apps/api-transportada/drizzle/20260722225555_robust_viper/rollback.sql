-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
BEGIN;

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260722225555_robust_viper'
      AND "hash" = 'b019b66026dde49df32af92d1962865a0d9927230338d5f2204ec53ca21d8d0b';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one CT-e batch migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

DROP TABLE "cte_batch_events";
DROP TABLE "cte_submission_records";
DROP TABLE "cte_batch_items";
DROP TABLE "cte_batches";

COMMIT;
