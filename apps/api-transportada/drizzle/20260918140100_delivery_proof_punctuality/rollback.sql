-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 159 T4 (ADR-0069 §2-5): os parâmetros de pontualidade em
-- `company_delivery_proof_settings` e a posição + o veredito da foto em
-- `trip_delivery_proofs`. Migration puramente aditiva — nenhum dado de negócio anterior depende
-- destas colunas, e por isso o rollback não precisa de guarda de dado, só desfazer o DDL.
BEGIN;

ALTER TABLE "trip_delivery_proofs" DROP CONSTRAINT "trip_delivery_proofs_punctuality_check";
ALTER TABLE "trip_delivery_proofs" DROP CONSTRAINT "trip_delivery_proofs_longitude_range_check";
ALTER TABLE "trip_delivery_proofs" DROP CONSTRAINT "trip_delivery_proofs_latitude_range_check";
ALTER TABLE "trip_delivery_proofs" DROP CONSTRAINT "trip_delivery_proofs_coordinates_check";

ALTER TABLE "company_delivery_proof_settings" DROP CONSTRAINT "company_delivery_proof_settings_missing_after_hours_check";
ALTER TABLE "company_delivery_proof_settings" DROP CONSTRAINT "company_delivery_proof_settings_missing_penalty_points_check";
ALTER TABLE "company_delivery_proof_settings" DROP CONSTRAINT "company_delivery_proof_settings_late_penalty_points_check";
ALTER TABLE "company_delivery_proof_settings" DROP CONSTRAINT "company_delivery_proof_settings_proof_radius_meters_check";
ALTER TABLE "company_delivery_proof_settings" DROP CONSTRAINT "company_delivery_proof_settings_proof_window_minutes_check";

ALTER TABLE "trip_delivery_proofs" DROP COLUMN "punctuality";
ALTER TABLE "trip_delivery_proofs" DROP COLUMN "captured_at";
ALTER TABLE "trip_delivery_proofs" DROP COLUMN "accuracy_meters";
ALTER TABLE "trip_delivery_proofs" DROP COLUMN "longitude";
ALTER TABLE "trip_delivery_proofs" DROP COLUMN "latitude";

ALTER TABLE "company_delivery_proof_settings" DROP COLUMN "missing_after_hours";
ALTER TABLE "company_delivery_proof_settings" DROP COLUMN "missing_penalty_points";
ALTER TABLE "company_delivery_proof_settings" DROP COLUMN "late_penalty_points";
ALTER TABLE "company_delivery_proof_settings" DROP COLUMN "proof_radius_meters";
ALTER TABLE "company_delivery_proof_settings" DROP COLUMN "proof_window_minutes";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260918140100_delivery_proof_punctuality';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one delivery_proof_punctuality journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
