-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverts the terminal status that lets a rejected/failed NFS-e release its notes (spec 042).
-- Destructive: the constraint goes back to rejecting 'discarded', so any invoice already in that
-- status makes the ALTER fail. Decide what those invoices become before running.
BEGIN;

ALTER TABLE "nfse_service_invoices" DROP CONSTRAINT "nfse_service_invoices_status_check",
  ADD CONSTRAINT "nfse_service_invoices_status_check" CHECK ("status" in ('requested', 'issuing', 'pending_authorization', 'authorized', 'cancellation_requested', 'rejected', 'cancelled', 'failed'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260817201606_nfse_invoice_discarded_status'
      AND "hash" = '3edc0dbfb23464af6e430002e1846f599f66f789cded2896058ff6e3980fd734';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one nfse_invoice_discarded_status migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
