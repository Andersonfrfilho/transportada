-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverts the CT-e idempotency ledger table.
-- Destructive: every processed-message marker of the CT-e rail is discarded, so a redelivery after
-- the rollback transmits to SEFAZ again.
BEGIN;

DROP TABLE "cte_processed_messages";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260728004715_cte_processed_messages'
      AND "hash" = '0414203388a3bbc873954986da1db2c8779160e1179777e4df10f3b7822d0f9c';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one cte_processed_messages migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
