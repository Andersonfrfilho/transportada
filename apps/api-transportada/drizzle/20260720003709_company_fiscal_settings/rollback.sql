-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Never execute this file from application startup.
BEGIN;

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
  WHERE "name" = '20260720003709_company_fiscal_settings'
    AND "hash" = '839faaf37f9f4e4ed5bce93b1199573795bf9ad83920261efa0a5a4a05ff2222';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one company fiscal settings migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

DROP TRIGGER "audit_logs_append_only_trigger" ON "audit_logs";
DROP FUNCTION "reject_audit_logs_mutation"();
DROP TABLE "audit_logs";
DROP TABLE "idempotency_records";
DROP TRIGGER "fiscal_sequence_reservations_append_only_trigger" ON "fiscal_sequence_reservations";
DROP FUNCTION "reject_fiscal_sequence_reservations_mutation"();
DROP TABLE "fiscal_sequence_reservations";
DROP TABLE "fiscal_sequences";
DROP TABLE "digital_certificates";
DROP TABLE "company_fiscal_profiles";

COMMIT;
