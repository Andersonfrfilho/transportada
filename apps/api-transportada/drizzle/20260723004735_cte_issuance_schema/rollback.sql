-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
BEGIN;

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260723004735_cte_issuance_schema'
      AND "hash" = 'fa41276f262621d082efa1791a12e6b5e3f43b26742882f89bbe0860edf8fb86';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one CT-e issuance migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

ALTER TABLE "cte_retry_schedules" DROP CONSTRAINT "cte_retry_schedules_company_batch_item_fk";
ALTER TABLE "cte_retry_schedules" DROP CONSTRAINT "cte_retry_schedules_company_attempt_fk";
ALTER TABLE "cte_retry_schedules" DROP CONSTRAINT "cte_retry_schedules_company_id_companies_id_fk";
ALTER TABLE "cte_issuance_events" DROP CONSTRAINT "cte_issuance_events_company_batch_item_fk";
ALTER TABLE "cte_issuance_events" DROP CONSTRAINT "cte_issuance_events_company_attempt_fk";
ALTER TABLE "cte_issuance_events" DROP CONSTRAINT "cte_issuance_events_company_id_companies_id_fk";
ALTER TABLE "cte_issuance_attempts" DROP CONSTRAINT "cte_issuance_attempts_company_reservation_fk";
ALTER TABLE "cte_issuance_attempts" DROP CONSTRAINT "cte_issuance_attempts_company_batch_item_fk";
ALTER TABLE "cte_issuance_attempts" DROP CONSTRAINT "cte_issuance_attempts_company_batch_fk";
ALTER TABLE "cte_issuance_attempts" DROP CONSTRAINT "cte_issuance_attempts_company_id_companies_id_fk";
ALTER TABLE "cte_fiscal_documents" DROP CONSTRAINT "cte_fiscal_documents_company_xml_object_fk";
ALTER TABLE "cte_fiscal_documents" DROP CONSTRAINT "cte_fiscal_documents_company_attempt_fk";
ALTER TABLE "cte_fiscal_documents" DROP CONSTRAINT "cte_fiscal_documents_company_batch_item_fk";
ALTER TABLE "cte_fiscal_documents" DROP CONSTRAINT "cte_fiscal_documents_company_id_companies_id_fk";
DROP INDEX "cte_retry_schedules_company_status_next_attempt_idx";
DROP INDEX "cte_issuance_events_company_batch_item_created_at_idx";
DROP INDEX "cte_issuance_attempts_company_status_created_at_idx";
DROP TABLE "cte_retry_schedules";
DROP TABLE "cte_issuance_events";
DROP TABLE "cte_fiscal_documents";
DROP TABLE "cte_issuance_attempts";
ALTER TABLE "fiscal_sequence_reservations" DROP CONSTRAINT "fiscal_sequence_reservations_company_id_id_unique";

COMMIT;
