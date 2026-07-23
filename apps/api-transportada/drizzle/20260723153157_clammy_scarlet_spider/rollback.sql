-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
BEGIN;

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260723153157_clammy_scarlet_spider'
      AND "hash" = 'b152975098d8aa00a7eb83275310e66a52b254b8887cdba267fde158918d8448';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one operations audit migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

ALTER TABLE "audit_logs"
  DROP CONSTRAINT "audit_logs_action_check";
ALTER TABLE "audit_logs"
  DROP CONSTRAINT "audit_logs_permission_check";
ALTER TABLE "audit_logs"
  DROP CONSTRAINT "audit_logs_reason_check";
ALTER TABLE "audit_logs"
  DROP CONSTRAINT "audit_logs_result_check";
ALTER TABLE "audit_logs"
  DROP CONSTRAINT "audit_logs_actor_membership_fk";

DROP INDEX "processing_jobs_company_correlation_idx";
DROP INDEX "processing_jobs_company_module_entity_idx";
DROP INDEX "processing_jobs_company_status_next_attempt_idx";
DROP INDEX "audit_logs_company_correlation_idx";
DROP INDEX "audit_logs_company_target_idx";
DROP INDEX "audit_logs_company_created_at_idx";

DROP TABLE "processing_jobs";

ALTER TABLE "audit_logs"
  DROP COLUMN "metadata",
  DROP COLUMN "reason",
  DROP COLUMN "result",
  DROP COLUMN "target_id",
  DROP COLUMN "target_type",
  DROP COLUMN "permission";

COMMIT;
