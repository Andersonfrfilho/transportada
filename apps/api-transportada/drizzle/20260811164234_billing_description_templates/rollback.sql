-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Drops the named description template catalog.
-- Perdem-se os modelos cadastrados depois da migration; o texto padrão de cada empresa continua em
-- company_fiscal_profiles.billing_observations, que a migration só copiou, nunca esvaziou.
BEGIN;

DROP TABLE IF EXISTS "billing_description_templates";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260811164234_billing_description_templates'
      AND "hash" = '4c107f85361898547f3b6b4f633774dc2592ab2ba2d7ed685142f27888f2ec2b';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one billing_description_templates migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
