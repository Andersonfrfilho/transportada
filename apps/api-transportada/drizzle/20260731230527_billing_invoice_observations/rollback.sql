-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverts the editable observations of a billing invoice and the widened event-name check.
-- Destructive: dropping "observations" discards every note typed by the operator, and narrowing
-- the event-name check fails while any 'invoice_updated' row exists — delete or archive that audit
-- trail first, deliberately, because it records who changed which invoice amounts.
BEGIN;

ALTER TABLE "billing_invoices" DROP CONSTRAINT IF EXISTS "billing_invoices_observations_check";

ALTER TABLE "billing_invoices" DROP COLUMN IF EXISTS "observations";

ALTER TABLE "billing_invoice_events" DROP CONSTRAINT IF EXISTS "billing_invoice_events_name_check";

ALTER TABLE "billing_invoice_events" ADD CONSTRAINT "billing_invoice_events_name_check"
  CHECK ("event_name" in ('invoice_created', 'invoice_cancelled', 'document_generated', 'document_failed'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260731230527_billing_invoice_observations'
      AND "hash" = '7318fca0f7d26b928389ba93d353d8784fd82afc0250c3535fa6ba3b36c7d1e3';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one billing_invoice_observations migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
