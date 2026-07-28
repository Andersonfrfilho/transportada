-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Narrows fiscal_sequences.model back to 'cte', undoing the MDF-e numbering range.
-- Refuses to run while an MDF-e sequence exists: a fiscal number already handed to SEFAZ can
-- never be discarded, so removing those rows is a manual fiscal decision, not a rollback step.
BEGIN;

DO $$
DECLARE
  mdfe_sequences integer;
BEGIN
  SELECT count(*) INTO mdfe_sequences FROM "fiscal_sequences" WHERE "model" = 'mdfe';

  IF mdfe_sequences > 0 THEN
    RAISE EXCEPTION 'Refusing to roll back: % MDF-e fiscal sequence(s) still exist', mdfe_sequences;
  END IF;
END
$$;

ALTER TABLE "fiscal_sequences"
  DROP CONSTRAINT "fiscal_sequences_model_check",
  ADD CONSTRAINT "fiscal_sequences_model_check" CHECK ("model" = 'cte');

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260728162353_mdfe_fiscal_sequence_model'
      AND "hash" = 'f7d9fa9e5712db8bd0ab797970ea4d09886fbce90c7c486534451007fe2e680a';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one mdfe_fiscal_sequence_model migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
