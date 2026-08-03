-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverts the SEFAZ refusal message stored beside the refusal code on the manifest attempt.
-- Destructive: every recorded refusal message is lost and only the code survives.
BEGIN;

ALTER TABLE "mdfe_issuance_attempts" DROP COLUMN "last_error_message";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260729114737_mdfe_attempt_last_error_message'
      AND "hash" = '7e83fab837bb2d915693e2d1242b435622e5a54b93a78744396136c265cc9bb3';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one mdfe_attempt_last_error_message migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
