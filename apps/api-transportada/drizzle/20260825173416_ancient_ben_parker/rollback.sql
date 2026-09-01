-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Drops the aggregate document review table and restores the storage purpose enum to before it.
BEGIN;

DROP TABLE IF EXISTS "aggregate_documents";

ALTER TABLE "stored_objects" DROP CONSTRAINT "stored_objects_purpose_check", ADD CONSTRAINT "stored_objects_purpose_check" CHECK ("purpose" in ('import_source', 'nfe_document', 'nfe_event', 'billing_document', 'cte_document', 'mdfe_document', 'nfse_document'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260825173416_ancient_ben_parker'
      AND "hash" = '4ff52f1d5f07243fa0af1d2af67d797190adf4c112bfb473546c30b3ba9f3740';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one ancient_ben_parker migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
