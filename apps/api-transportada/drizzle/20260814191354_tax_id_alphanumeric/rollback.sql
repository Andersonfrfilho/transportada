-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Restores the numeric-only CHECK on every CNPJ and access key column.
-- Se alguma linha já gravou CNPJ com letra, o ALTER falha ao revalidar e a transação inteira volta
-- atrás — que é o comportamento correto: o rollback não pode apagar documento válido em silêncio.
BEGIN;

ALTER TABLE "company_fiscal_profiles" DROP CONSTRAINT "company_fiscal_profiles_cnpj_check", ADD CONSTRAINT "company_fiscal_profiles_cnpj_check" CHECK ("cnpj" ~ '^[0-9]{14}$');

ALTER TABLE "company_fiscal_profiles" DROP CONSTRAINT "company_fiscal_profiles_mdfe_insurer_tax_id_check", ADD CONSTRAINT "company_fiscal_profiles_mdfe_insurer_tax_id_check" CHECK (length("mdfe_insurer_tax_id") = 0 or "mdfe_insurer_tax_id" ~ '^[0-9]{11}$|^[0-9]{14}$');

ALTER TABLE "digital_certificates" DROP CONSTRAINT "digital_certificates_validated_cnpj_check", ADD CONSTRAINT "digital_certificates_validated_cnpj_check" CHECK ("validated_cnpj" ~ '^[0-9]{14}$');

ALTER TABLE "nfe_documents" DROP CONSTRAINT "nfe_documents_access_key_check", ADD CONSTRAINT "nfe_documents_access_key_check" CHECK ("access_key" ~ '^[0-9]{44}$');

ALTER TABLE "nfe_events" DROP CONSTRAINT "nfe_events_access_key_check", ADD CONSTRAINT "nfe_events_access_key_check" CHECK ("target_access_key" ~ '^[0-9]{44}$');

ALTER TABLE "nfe_import_items" DROP CONSTRAINT "nfe_import_items_access_key_check", ADD CONSTRAINT "nfe_import_items_access_key_check" CHECK ("access_key" is null or "access_key" ~ '^[0-9]{44}$');

ALTER TABLE "cte_fiscal_documents" DROP CONSTRAINT "cte_fiscal_documents_access_key_check", ADD CONSTRAINT "cte_fiscal_documents_access_key_check" CHECK ("access_key" ~ '^[0-9]{44}$');

ALTER TABLE "billing_invoice_items" DROP CONSTRAINT "billing_invoice_items_cte_access_key_check", ADD CONSTRAINT "billing_invoice_items_cte_access_key_check" CHECK ("cte_access_key" ~ '^[0-9]{44}$');

ALTER TABLE "billing_invoices" DROP CONSTRAINT "billing_invoices_customer_document_check", ADD CONSTRAINT "billing_invoices_customer_document_check" CHECK ("customer_document" ~ '^[0-9]{11,14}$');

ALTER TABLE "fleet_drivers" DROP CONSTRAINT "fleet_drivers_linked_tax_id_check", ADD CONSTRAINT "fleet_drivers_linked_tax_id_check" CHECK (length("linked_tax_id") = 0 or "linked_tax_id" ~ '^[0-9]{14}$');

ALTER TABLE "fleet_vehicles" DROP CONSTRAINT "fleet_vehicles_owner_tax_id_check", ADD CONSTRAINT "fleet_vehicles_owner_tax_id_check" CHECK (length("owner_tax_id") = 0 or "owner_tax_id" ~ '^[0-9]{11}$' or "owner_tax_id" ~ '^[0-9]{14}$');

ALTER TABLE "mdfe_fiscal_documents" DROP CONSTRAINT "mdfe_fiscal_documents_access_key_check", ADD CONSTRAINT "mdfe_fiscal_documents_access_key_check" CHECK ("access_key" ~ '^[0-9]{44}$');

ALTER TABLE "mdfe_manifest_items" DROP CONSTRAINT "mdfe_manifest_items_access_key_check", ADD CONSTRAINT "mdfe_manifest_items_access_key_check" CHECK ("access_key" ~ '^[0-9]{44}$');

ALTER TABLE "mdfe_manifests" DROP CONSTRAINT "mdfe_manifests_contractor_tax_id_check", ADD CONSTRAINT "mdfe_manifests_contractor_tax_id_check" CHECK (length("contractor_tax_id") = 0 or "contractor_tax_id" ~ '^[0-9]{11}$|^[0-9]{14}$');

ALTER TABLE "nfse_provider_credentials" DROP CONSTRAINT "nfse_provider_credentials_tax_id_check", ADD CONSTRAINT "nfse_provider_credentials_tax_id_check" CHECK ("tax_id" ~ '^[0-9]{14}$');

ALTER TABLE "nfse_service_invoices" DROP CONSTRAINT "nfse_service_invoices_taker_tax_id_check", ADD CONSTRAINT "nfse_service_invoices_taker_tax_id_check" CHECK ("taker_tax_id" ~ '^[0-9]{11}$|^[0-9]{14}$');

ALTER TABLE "cte_emission_profile_matchers" DROP CONSTRAINT "cte_emission_profile_matchers_tax_id_check", ADD CONSTRAINT "cte_emission_profile_matchers_tax_id_check" CHECK ("tax_id" ~ '^[0-9]{8}$' or "tax_id" ~ '^[0-9]{14}$');

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260814191354_tax_id_alphanumeric'
      AND "hash" = '0c365960b4fceb0b2c1a079e34790805032a0f86f2afc558eea77f0778958e82';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one tax_id_alphanumeric migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
