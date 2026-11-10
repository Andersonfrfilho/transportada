-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 321 T1: remove as marcas `blocks_contractor_notice` e `counts_cargo_on_pickup_trip` do tipo de ocorrência.
--
-- ⚠️ Só com aprovação humana. Recusa-se a rodar com tipo marcado: apagar `blocks_contractor_notice` voltaria a avisar
-- a contratante de um tipo que a operação declarou que nunca a avisa.
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  configured_types integer;
BEGIN
  SELECT count(*) INTO configured_types FROM "company_occurrence_types"
    WHERE "blocks_contractor_notice" OR NOT "counts_cargo_on_pickup_trip";
  IF configured_types > 0 THEN
    RAISE EXCEPTION 'company_occurrence_types has % configured rows; refusing to drop the spec 321 columns', configured_types;
  END IF;
END
$$;

ALTER TABLE "company_occurrence_types" DROP COLUMN "counts_cargo_on_pickup_trip";
ALTER TABLE "company_occurrence_types" DROP COLUMN "blocks_contractor_notice";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261110210213_occurrence_contractor_notice_block';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one occurrence_contractor_notice_block journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
