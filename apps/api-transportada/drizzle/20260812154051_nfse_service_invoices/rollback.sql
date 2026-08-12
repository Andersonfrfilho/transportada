-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Remove o trilho de NFS-e inteiro e devolve o check de propósito de `stored_objects` ao que era.
-- Falha de propósito se já houver objeto arquivado com propósito 'nfse_document': o check antigo o
-- rejeitaria, e apagar arquivo fiscal autorizado não é rollback, é perda de documento.
BEGIN;

DROP TABLE IF EXISTS "nfse_fiscal_documents";
DROP TABLE IF EXISTS "nfse_issuance_events";
DROP TABLE IF EXISTS "nfse_issuance_payloads";
DROP TABLE IF EXISTS "nfse_issuance_outbox";
DROP TABLE IF EXISTS "nfse_processed_messages";
DROP TABLE IF EXISTS "nfse_service_invoice_charges";
DROP TABLE IF EXISTS "nfse_service_invoice_documents";
DROP TABLE IF EXISTS "nfse_issuance_attempts";
DROP TABLE IF EXISTS "nfse_service_invoices";
DROP TABLE IF EXISTS "nfse_provider_credentials";
DROP TABLE IF EXISTS "nfse_emission_profiles";

ALTER TABLE "company_fiscal_profiles"
  DROP CONSTRAINT IF EXISTS "company_fiscal_profiles_nfse_retry_backoff_check",
  DROP CONSTRAINT IF EXISTS "company_fiscal_profiles_nfse_retry_max_attempts_check",
  DROP COLUMN IF EXISTS "nfse_retry_backoff_seconds",
  DROP COLUMN IF EXISTS "nfse_retry_max_attempts";

ALTER TABLE "stored_objects"
  DROP CONSTRAINT "stored_objects_purpose_check",
  ADD CONSTRAINT "stored_objects_purpose_check"
  CHECK ("purpose" in ('import_source', 'nfe_document', 'nfe_event', 'billing_document', 'cte_document', 'mdfe_document'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260812154051_nfse_service_invoices'
      AND "hash" = 'b01ac2cc9936006399bf28500bd9c89e16c8bd7a8759acc7ec50d8c606fcc455';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one nfse_service_invoices migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
