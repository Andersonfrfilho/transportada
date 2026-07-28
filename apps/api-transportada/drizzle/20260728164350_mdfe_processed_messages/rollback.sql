-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Drops the MDF-e rail idempotency ledger.
-- Refuses to run while the ledger has rows: dropping them makes the consumer replay events that
-- already reached SEFAZ.
BEGIN;

DO $$
DECLARE
  processed_messages integer;
BEGIN
  SELECT count(*) INTO processed_messages FROM "mdfe_processed_messages";
  IF processed_messages > 0 THEN
    RAISE EXCEPTION 'Refusing to roll back: % MDF-e processed message(s) still recorded', processed_messages;
  END IF;
END
$$;

DROP TABLE "mdfe_processed_messages";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260728164350_mdfe_processed_messages'
      AND "hash" = 'ff54642278df5f99803a6c2b6d8b68a69b708b559eb112778bccc808ee328ad8';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one mdfe_processed_messages migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
