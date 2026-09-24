-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz a spec 164 T16: o tipo `returned_goods` em `delivery_charges`/`delivery_client_charge_rules`
-- e a coluna `occurrence_id` (nulável, aditiva) de `delivery_charges` — a ponte que liga a cobrança
-- de mercadoria devolvida ao acerto e à foto da ocorrência.
--
-- `delivery_charges` já roda em produção: recusa (RAISE) em vez de perder dado de verdade — se
-- alguma linha usa `occurrence_id`, o rollback para antes de apagar a coluna.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "delivery_charges" WHERE "occurrence_id" IS NOT NULL) THEN
    RAISE EXCEPTION 'delivery_charges has rows using occurrence_id, refusing rollback';
  END IF;
END
$$;

ALTER TABLE "delivery_charges" DROP CONSTRAINT "delivery_charges_returned_goods_origin_check";

ALTER TABLE "delivery_charges" DROP CONSTRAINT "delivery_charges_occurrence_type_check";

ALTER TABLE "delivery_charges" DROP CONSTRAINT "delivery_charges_type_check";

ALTER TABLE "delivery_charges"
  ADD CONSTRAINT "delivery_charges_type_check"
  CHECK ("charge_type" in ('unloading', 'scheduling', 'platform', 'parking', 'other'));

ALTER TABLE "delivery_client_charge_rules" DROP CONSTRAINT "delivery_client_charge_rules_type_check";

ALTER TABLE "delivery_client_charge_rules"
  ADD CONSTRAINT "delivery_client_charge_rules_type_check"
  CHECK ("charge_type" in ('unloading', 'scheduling', 'platform', 'parking', 'other'));

ALTER TABLE "delivery_charges" DROP CONSTRAINT "delivery_charges_company_occurrence_fk";

DROP INDEX "delivery_charges_contractor_period_idx";

DROP INDEX "delivery_charges_occurrence_unique";

DROP INDEX "delivery_charges_company_occurrence_idx";

ALTER TABLE "delivery_charges" DROP COLUMN "occurrence_id";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260922215436_delivery_charges_occurrence'
      AND "hash" = '975dadf13479c2a2d4767de312f16bc6864e9bf041974d003d30b6c1fe53fc4f';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one delivery_charges_occurrence migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
