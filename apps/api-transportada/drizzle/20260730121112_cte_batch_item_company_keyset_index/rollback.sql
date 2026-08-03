-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverts the keyset index that pages the cross-batch CT-e listing.
-- Non-destructive: dropping the index removes no data, only the ordered access path, so the
-- listing falls back to a sort over the tenant partition.
BEGIN;

DROP INDEX IF EXISTS "cte_batch_items_company_created_at_id_idx";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260730121112_cte_batch_item_company_keyset_index'
      AND "hash" = 'ba96dfe6a2c0a887182b8291757e7d3804bb59c04302919897ae6fcd5a2b13b5';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one cte_batch_item_company_keyset_index migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
