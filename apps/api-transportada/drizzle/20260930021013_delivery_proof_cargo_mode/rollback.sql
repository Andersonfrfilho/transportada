-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 220 (RF01, RF06): tira `cargo` e `cargo_minimum_count` das três tabelas de
-- configuração do comprovante. O modo da foto do canhoto (`photo`) não é tocado.
BEGIN;

ALTER TABLE "delivery_proof_setting_overrides"
  DROP CONSTRAINT IF EXISTS "delivery_proof_setting_overrides_cargo_minimum_count_check",
  DROP CONSTRAINT IF EXISTS "delivery_proof_setting_overrides_cargo_check";

ALTER TABLE "delivery_proof_setting_overrides"
  DROP COLUMN IF EXISTS "cargo_minimum_count",
  DROP COLUMN IF EXISTS "cargo";

ALTER TABLE "delivery_proof_setting_contractor_overrides"
  DROP CONSTRAINT IF EXISTS "delivery_proof_setting_contractor_overrides_cargo_minimum_count_check",
  DROP CONSTRAINT IF EXISTS "delivery_proof_setting_contractor_overrides_cargo_check";

ALTER TABLE "delivery_proof_setting_contractor_overrides"
  DROP COLUMN IF EXISTS "cargo_minimum_count",
  DROP COLUMN IF EXISTS "cargo";

ALTER TABLE "company_delivery_proof_settings"
  DROP CONSTRAINT IF EXISTS "company_delivery_proof_settings_cargo_minimum_count_check",
  DROP CONSTRAINT IF EXISTS "company_delivery_proof_settings_cargo_check";

ALTER TABLE "company_delivery_proof_settings"
  DROP COLUMN IF EXISTS "cargo_minimum_count",
  DROP COLUMN IF EXISTS "cargo";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260930021013_delivery_proof_cargo_mode';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one delivery_proof_cargo_mode journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
