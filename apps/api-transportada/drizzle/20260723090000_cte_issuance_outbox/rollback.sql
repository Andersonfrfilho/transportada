-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
BEGIN;

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260723090000_cte_issuance_outbox'
      AND "hash" = '64592db36f733b572a0d8fa270aa71d01ac947c53ee0f97b61c222178e65b409';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one CT-e issuance outbox migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

DROP INDEX "cte_issuance_outbox_company_published_next_attempt_created_idx";
ALTER TABLE "cte_issuance_outbox"
  DROP CONSTRAINT "cte_issuance_outbox_actor_membership_fk";
ALTER TABLE "cte_issuance_outbox"
  DROP CONSTRAINT "cte_issuance_outbox_company_attempt_fk";
ALTER TABLE "cte_issuance_outbox"
  DROP CONSTRAINT "cte_issuance_outbox_company_batch_item_fk";
ALTER TABLE "cte_issuance_outbox"
  DROP CONSTRAINT "cte_issuance_outbox_company_batch_fk";
ALTER TABLE "cte_issuance_outbox"
  DROP CONSTRAINT "cte_issuance_outbox_company_aggregate_fk";
ALTER TABLE "cte_issuance_outbox"
  DROP CONSTRAINT "cte_issuance_outbox_company_id_companies_id_fk";
DROP TABLE "cte_issuance_outbox";

COMMIT;
