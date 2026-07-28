-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverts the storage purpose that lets the MDF-e XMLs be persisted in stored_objects.
-- Destructive: the constraint goes back to rejecting 'mdfe_document', so rows already stored with
-- that purpose make the ALTER fail. Migrate or delete those rows (and the mdfe_fiscal_documents
-- that reference them) before running.
BEGIN;

ALTER TABLE "stored_objects" DROP CONSTRAINT "stored_objects_purpose_check",
  ADD CONSTRAINT "stored_objects_purpose_check" CHECK ("purpose" in ('import_source', 'nfe_document', 'nfe_event', 'billing_document', 'cte_document'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260728172757_mdfe_document_storage_purpose'
      AND "hash" = '8258dfa3b094893e92e7df80f6340574baee81d9114db72a3511c066a65237ff';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one mdfe_document_storage_purpose migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
