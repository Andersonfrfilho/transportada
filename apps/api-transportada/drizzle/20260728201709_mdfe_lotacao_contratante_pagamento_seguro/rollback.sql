-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverts the MDF-e carga lotação, contratante, pagamento and seguro fields.
-- Destructive: drops the columns, so any configured insurer, bank, contractor, freight value,
-- endorsement and loading/discharge postal codes are lost and have to be typed again.
BEGIN;

ALTER TABLE "mdfe_manifests" DROP CONSTRAINT "mdfe_manifests_postal_code_check";

ALTER TABLE "mdfe_manifests" DROP CONSTRAINT "mdfe_manifests_contractor_tax_id_check";

ALTER TABLE "mdfe_manifests" DROP CONSTRAINT "mdfe_manifests_freight_value_check";

ALTER TABLE "company_fiscal_profiles" DROP CONSTRAINT "company_fiscal_profiles_mdfe_insurer_tax_id_check";

ALTER TABLE "company_fiscal_profiles" DROP CONSTRAINT "company_fiscal_profiles_mdfe_insurance_responsibility_check";

ALTER TABLE "mdfe_manifests" DROP COLUMN "insurance_endorsement",
  DROP COLUMN "discharge_postal_code",
  DROP COLUMN "loading_postal_code",
  DROP COLUMN "freight_value",
  DROP COLUMN "contractor_name",
  DROP COLUMN "contractor_tax_id";

ALTER TABLE "company_fiscal_profiles" DROP COLUMN "mdfe_payment_pix_key",
  DROP COLUMN "mdfe_payment_bank_branch",
  DROP COLUMN "mdfe_payment_bank_code",
  DROP COLUMN "mdfe_insurance_policy",
  DROP COLUMN "mdfe_insurer_tax_id",
  DROP COLUMN "mdfe_insurer_name",
  DROP COLUMN "mdfe_insurance_responsibility";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260728201709_mdfe_lotacao_contratante_pagamento_seguro'
      AND "hash" = '3a8d5fc4b808ea734a979a0e59bc9c2dc9d9d1682c201d8fe4b7a0d9d0bae6c7';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one mdfe_lotacao_contratante_pagamento_seguro migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
