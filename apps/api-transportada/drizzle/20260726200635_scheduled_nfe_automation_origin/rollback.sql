-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverts the scheduled-distribution automation groundwork: the origin
-- discriminator on nfe_imports/processing_outbox and the company_distribution_settings
-- opt-in table. Non-destructive to the actor columns (they were never nullable);
-- only additive columns, CHECKs, and the new table are removed. Safe as long as no
-- automation import has run (triggered_by='automation' rows would lose their marker).
BEGIN;

DROP TABLE IF EXISTS "company_distribution_settings";

ALTER TABLE "processing_outbox" DROP CONSTRAINT IF EXISTS "processing_outbox_origin_ck";
ALTER TABLE "nfe_imports" DROP CONSTRAINT IF EXISTS "nfe_imports_origin_ck";
ALTER TABLE "processing_outbox" DROP COLUMN IF EXISTS "automation_job";
ALTER TABLE "processing_outbox" DROP COLUMN IF EXISTS "triggered_by";
ALTER TABLE "nfe_imports" DROP COLUMN IF EXISTS "automation_job";
ALTER TABLE "nfe_imports" DROP COLUMN IF EXISTS "triggered_by";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260726200635_scheduled_nfe_automation_origin'
      AND "hash" = '33db0a486ee46b2ca84773c6c305dcdaf48d224493fa5e212cdf1b03baa575a9';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one scheduled_nfe_automation_origin migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
