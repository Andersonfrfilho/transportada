-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
BEGIN;

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260723125103_oval_dexter_bennett'
      AND "hash" = '29bf09b08b5fce2046871e62979d69cd71035246ba953ee01f17ae70f8016ac8';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one billing migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

ALTER TABLE "stored_objects"
  DROP CONSTRAINT "stored_objects_purpose_check",
  ADD CONSTRAINT "stored_objects_purpose_check"
    CHECK ("purpose" in ('import_source', 'nfe_document', 'nfe_event'));

DROP INDEX "billing_invoice_documents_company_invoice_created_at_idx";
DROP INDEX "billing_invoice_events_company_invoice_occurred_at_idx";
DROP INDEX "billing_invoice_items_company_invoice_line_idx";
DROP INDEX "billing_invoices_company_status_due_date_idx";
DROP INDEX "billing_invoices_company_customer_created_at_idx";

ALTER TABLE "billing_invoice_documents"
  DROP CONSTRAINT "billing_invoice_documents_company_object_fk";
ALTER TABLE "billing_invoice_documents"
  DROP CONSTRAINT "billing_invoice_documents_company_invoice_fk";
ALTER TABLE "billing_invoice_documents"
  DROP CONSTRAINT "billing_invoice_documents_company_id_companies_id_fk";

ALTER TABLE "billing_invoice_events"
  DROP CONSTRAINT "billing_invoice_events_actor_membership_fk";
ALTER TABLE "billing_invoice_events"
  DROP CONSTRAINT "billing_invoice_events_company_invoice_fk";
ALTER TABLE "billing_invoice_events"
  DROP CONSTRAINT "billing_invoice_events_company_id_companies_id_fk";

ALTER TABLE "billing_invoice_items"
  DROP CONSTRAINT "billing_invoice_items_company_batch_item_fk";
ALTER TABLE "billing_invoice_items"
  DROP CONSTRAINT "billing_invoice_items_company_batch_fk";
ALTER TABLE "billing_invoice_items"
  DROP CONSTRAINT "billing_invoice_items_company_cte_document_fk";
ALTER TABLE "billing_invoice_items"
  DROP CONSTRAINT "billing_invoice_items_company_invoice_fk";
ALTER TABLE "billing_invoice_items"
  DROP CONSTRAINT "billing_invoice_items_company_id_companies_id_fk";

ALTER TABLE "billing_invoices"
  DROP CONSTRAINT "billing_invoices_actor_membership_fk";
ALTER TABLE "billing_invoices"
  DROP CONSTRAINT "billing_invoices_company_id_companies_id_fk";

DROP TABLE "billing_invoice_documents";
DROP TABLE "billing_invoice_events";
DROP TABLE "billing_invoice_items";
DROP TABLE "billing_invoices";

COMMIT;
