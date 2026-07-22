-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
BEGIN;

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
  WHERE "name" = '20260722170000_nfe_retry_constraints'
    AND "hash" = '3a71ae8e73f86161fdaa8b8886514c40577641d1e92cbb30014e9344653a2712';
  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one NF-e retry migration journal entry, removed %', deleted_migrations;
  END IF;
END
$$;

ALTER TABLE "nfe_import_items"
  DROP CONSTRAINT "nfe_import_items_company_id_import_id_ordinal_attempt_unique";
ALTER TABLE "nfe_import_items"
  DROP CONSTRAINT "nfe_import_items_company_id_import_id_source_attempt_unique";
ALTER TABLE "nfe_import_items"
  ADD CONSTRAINT "nfe_import_items_company_id_import_id_ordinal_unique"
  UNIQUE("company_id", "import_id", "ordinal");
ALTER TABLE "nfe_import_items"
  ADD CONSTRAINT "nfe_import_items_company_id_import_id_source_replay_unique"
  UNIQUE("company_id", "import_id", "source_sha256", "source_entry");

COMMIT;
