-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 315: remove a localização, o horário de chegada e a espera mínima do tipo de ocorrência.
--
-- ⚠️ Só com aprovação humana. Recusa-se a rodar com tipo configurado: apagar as colunas afrouxaria a exigência
-- que a operação declarou.
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  configured_types integer;
BEGIN
  SELECT count(*) INTO configured_types FROM "company_occurrence_types"
    WHERE "location_mode" <> 'off' OR "arrival_time_mode" <> 'off' OR "min_wait_after_arrival_minutes" IS NOT NULL;
  IF configured_types > 0 THEN
    RAISE EXCEPTION 'company_occurrence_types has % configured rows; refusing to drop the spec 315 columns', configured_types;
  END IF;
END
$$;

ALTER TABLE "company_occurrence_types" DROP CONSTRAINT "company_occurrence_types_min_wait_check";
ALTER TABLE "company_occurrence_types" DROP CONSTRAINT "company_occurrence_types_arrival_time_mode_check";
ALTER TABLE "company_occurrence_types" DROP CONSTRAINT "company_occurrence_types_location_mode_check";
ALTER TABLE "company_occurrence_types" DROP COLUMN "min_wait_after_arrival_minutes";
ALTER TABLE "company_occurrence_types" DROP COLUMN "arrival_time_mode";
ALTER TABLE "company_occurrence_types" DROP COLUMN "location_mode";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261110180900_occurrence_location_arrival';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one occurrence_location_arrival journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
