-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverts the storage purpose that lets the authorized CT-e XML be persisted in stored_objects.
-- Destructive: the constraint goes back to rejecting 'cte_document', so rows already stored with
-- that purpose make the ALTER fail. Migrate or delete those rows (and the cte_fiscal_documents
-- that reference them) before running.
BEGIN;

ALTER TABLE "stored_objects" DROP CONSTRAINT "stored_objects_purpose_check",
  ADD CONSTRAINT "stored_objects_purpose_check" CHECK ("purpose" in ('import_source', 'nfe_document', 'nfe_event', 'billing_document'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260727201344_cte_fiscal_document_storage_purpose'
      AND "hash" = 'a2b7f97bb1fb58103d66b917eb59d977f298d43c8139b4bcc05d47a4f0717258';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one cte_fiscal_document_storage_purpose migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
