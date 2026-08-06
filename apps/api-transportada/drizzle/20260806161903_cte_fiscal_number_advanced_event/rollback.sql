-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverts the fiscal_number_advanced vocabulary of cte_issuance_events.
-- Destructive: the trail explaining why a CT-e changed its fiscal number disappears. The numbering
-- itself stays advanced — only the reason shown to the user is lost.
BEGIN;

DELETE FROM "cte_issuance_events" WHERE "event_name" = 'fiscal_number_advanced';

ALTER TABLE "cte_issuance_events"
  DROP CONSTRAINT "cte_issuance_events_name_check",
  ADD CONSTRAINT "cte_issuance_events_name_check" CHECK ("event_name" in ('issue_requested', 'cancel_requested', 'in_flight', 'authorized', 'rejected', 'failed', 'retry_scheduled', 'reconciliation_required', 'cancelled'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260806161903_cte_fiscal_number_advanced_event'
      AND "hash" = '21d16d024b17e5afe9c28b7d40f4df522411bbdfcb4ac71f2c248fbb263fe3b8';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one cte_fiscal_number_advanced_event migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
