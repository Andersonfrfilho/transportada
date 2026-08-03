-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverts the billing defaults the invoice PDF prints: bank, PIX and the default observations text.
-- Destructive: dropping these columns discards the banking data each tenant typed by hand, and the
-- invoice PDF silently goes back to closing without telling the customer where to pay.
BEGIN;

ALTER TABLE "company_fiscal_profiles"
  DROP CONSTRAINT IF EXISTS "company_fiscal_profiles_billing_observations_check";

ALTER TABLE "company_fiscal_profiles"
  DROP CONSTRAINT IF EXISTS "company_fiscal_profiles_billing_bank_branch_check";

ALTER TABLE "company_fiscal_profiles"
  DROP CONSTRAINT IF EXISTS "company_fiscal_profiles_billing_bank_code_check";

ALTER TABLE "company_fiscal_profiles" DROP COLUMN IF EXISTS "billing_observations";

ALTER TABLE "company_fiscal_profiles" DROP COLUMN IF EXISTS "billing_pix_key";

ALTER TABLE "company_fiscal_profiles" DROP COLUMN IF EXISTS "billing_bank_account";

ALTER TABLE "company_fiscal_profiles" DROP COLUMN IF EXISTS "billing_bank_branch";

ALTER TABLE "company_fiscal_profiles" DROP COLUMN IF EXISTS "billing_bank_code";

ALTER TABLE "company_fiscal_profiles" DROP COLUMN IF EXISTS "billing_bank_name";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260801040948_company_billing_defaults'
      AND "hash" = '70bfbcf39b1742bd2948262cc20654c16c68c57fa720de23f6c56f4e41154daa';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one company_billing_defaults migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
