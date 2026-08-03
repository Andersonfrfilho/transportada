-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverts the certificate purpose that lets an MDF-e certificate be stored at all.
-- Destructive: the constraint goes back to rejecting 'mdfe', so certificates already uploaded with
-- that purpose make the ALTER fail. Retire or delete those rows before running.
BEGIN;

ALTER TABLE "digital_certificates" DROP CONSTRAINT "digital_certificates_purpose_check",
  ADD CONSTRAINT "digital_certificates_purpose_check" CHECK ("purpose" = 'cte');

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260728235419_mdfe_certificate_purpose'
      AND "hash" = '574da3c194980e3548aa7041498e77c9cad8da159626729bd632b808346f23c0';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one mdfe_certificate_purpose migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
