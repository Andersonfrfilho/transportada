-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverts the terminal status that lets a rejected manifest release its CT-es (ADR-0017).
-- Destructive: the constraint goes back to rejecting 'discarded', so any manifest already in that
-- status makes the ALTER fail. Decide what those manifests become before running.
BEGIN;

ALTER TABLE "mdfe_manifests" DROP CONSTRAINT "mdfe_manifests_status_check",
  ADD CONSTRAINT "mdfe_manifests_status_check" CHECK ("status" in ('draft', 'issuing', 'authorized', 'rejected', 'closed', 'cancelled'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260729105113_mdfe_manifest_discarded_status'
      AND "hash" = '32a5d2e5635d79387d6ec2c861d84c401d07d53c212bf8f087bc063cf8a40f1f';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one mdfe_manifest_discarded_status migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
