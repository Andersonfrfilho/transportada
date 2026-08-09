-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Drops the taker recorded at issuance from cte_issuance_payloads.
-- Nothing is lost: the two columns are derived from the payload jsonb of the emission itself, which
-- stays intact, and reapplying the migration rebuilds them from it.
BEGIN;

ALTER TABLE "cte_issuance_payloads"
  DROP COLUMN IF EXISTS "taker_legal_name",
  DROP COLUMN IF EXISTS "taker_tax_id";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260809134710_cte_issuance_payload_taker'
      AND "hash" = '752cd69fcb7aab0f993b046de8b4ff3909f8e2ce80d3801219be6e997233ed9e';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one cte_issuance_payload_taker migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
