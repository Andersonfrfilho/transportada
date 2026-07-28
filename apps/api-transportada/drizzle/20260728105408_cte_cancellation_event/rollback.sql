-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverts the CT-e cancellation event (110111) state on cte_fiscal_documents and the cancel
-- vocabulary of cte_issuance_events / cte_issuance_outbox.
-- Destructive: every cancellation protocol, justification and stored procEventoCTe reference is
-- discarded. The CT-e stays cancelled at SEFAZ — only our record of it disappears.
BEGIN;

ALTER TABLE "cte_fiscal_documents"
  DROP CONSTRAINT "cte_fiscal_documents_cancelled_state_check",
  DROP CONSTRAINT "cte_fiscal_documents_cancellation_xml_check",
  DROP CONSTRAINT "cte_fiscal_documents_cancellation_sha256_check",
  DROP CONSTRAINT "cte_fiscal_documents_cancellation_justification_check",
  DROP CONSTRAINT "cte_fiscal_documents_company_cancellation_xml_object_fk",
  DROP COLUMN "cancellation_xml_sha256",
  DROP COLUMN "cancellation_xml_object_id",
  DROP COLUMN "cancelled_at",
  DROP COLUMN "cancellation_protocol",
  DROP COLUMN "cancellation_requested_at",
  DROP COLUMN "cancellation_justification";

-- Rows produced by the cancel rail have to go before the narrower checks can be restored.
DELETE FROM "cte_issuance_events" WHERE "event_name" = 'cancel_requested';
DELETE FROM "cte_issuance_outbox"
  WHERE "attempt_kind" = 'cancel'
     OR "event_type" = 'transportada.cte.item.cancel.requested';

ALTER TABLE "cte_issuance_events"
  DROP CONSTRAINT "cte_issuance_events_name_check",
  ADD CONSTRAINT "cte_issuance_events_name_check" CHECK ("event_name" in ('issue_requested', 'in_flight', 'authorized', 'rejected', 'failed', 'retry_scheduled', 'reconciliation_required', 'cancelled'));

ALTER TABLE "cte_issuance_outbox"
  DROP CONSTRAINT "cte_issuance_outbox_attempt_kind_check",
  ADD CONSTRAINT "cte_issuance_outbox_attempt_kind_check" CHECK ("attempt_kind" in ('issue', 'reprocess')),
  DROP CONSTRAINT "cte_issuance_outbox_event_type_check",
  ADD CONSTRAINT "cte_issuance_outbox_event_type_check" CHECK ("event_type" in ('transportada.cte.item.issue.requested'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260728105408_cte_cancellation_event'
      AND "hash" = 'c1e58f61c1bd1c99565c0b39c3505fe6636181ecb0068077b53d79c83793d161';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one cte_cancellation_event migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
