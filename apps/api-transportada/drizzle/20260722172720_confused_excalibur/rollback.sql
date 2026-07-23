-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Never execute this file from application startup.
-- If freight calculations were persisted, prefer roll-forward preservation over data rollback.
BEGIN;

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
  WHERE "name" = '20260722172720_confused_excalibur'
    AND "hash" = '41a91291061e08f6c1f39655b5e0f4bd46260ae19b9f7ea204bb47d7789157b6';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one freight calculation migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

ALTER TABLE "freight_calculations" DROP CONSTRAINT "freight_calculations_created_by_membership_fk";
ALTER TABLE "freight_calculations" DROP CONSTRAINT "freight_calculations_company_rule_version_id_fk";
ALTER TABLE "freight_calculations" DROP CONSTRAINT "freight_calculations_company_rule_version_fk";
ALTER TABLE "freight_calculations" DROP CONSTRAINT "freight_calculations_company_rule_fk";
ALTER TABLE "freight_calculations" DROP CONSTRAINT "freight_calculations_company_nfe_document_fk";
ALTER TABLE "freight_calculations" DROP CONSTRAINT "freight_calculations_company_id_companies_id_fkey";
ALTER TABLE "freight_rule_versions" DROP CONSTRAINT "freight_rule_versions_created_by_membership_fk";
ALTER TABLE "freight_rule_versions" DROP CONSTRAINT "freight_rule_versions_company_rule_fk";
ALTER TABLE "freight_rule_versions" DROP CONSTRAINT "freight_rule_versions_company_id_companies_id_fkey";
ALTER TABLE "freight_rules" DROP CONSTRAINT "freight_rules_created_by_membership_fk";
ALTER TABLE "freight_rules" DROP CONSTRAINT "freight_rules_company_id_companies_id_fkey";

DROP TABLE "freight_calculations";
DROP TABLE "freight_rule_versions";
DROP TABLE "freight_rules";

COMMIT;
