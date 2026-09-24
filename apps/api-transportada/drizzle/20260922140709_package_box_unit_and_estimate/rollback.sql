-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 163 (medida da unidade e caixa estimada em nfe_package_boxes).
--
-- ⚠️ Apaga a medida da unidade e a caixa estimada gravadas. A medida real da caixa (length_mm &
-- cia., measurement_source) nao e tocada — a estimativa nunca escreveu ali.
BEGIN;

ALTER TABLE "nfe_package_boxes" DROP CONSTRAINT "nfe_package_boxes_estimated_together_check";
ALTER TABLE "nfe_package_boxes" DROP CONSTRAINT "nfe_package_boxes_estimated_dimensions_check";
ALTER TABLE "nfe_package_boxes" DROP CONSTRAINT "nfe_package_boxes_unit_measurement_source_check";
ALTER TABLE "nfe_package_boxes" DROP CONSTRAINT "nfe_package_boxes_unit_dimensions_check";
ALTER TABLE "nfe_package_boxes"
  DROP COLUMN "estimated_at",
  DROP COLUMN "estimated_arrangement",
  DROP COLUMN "estimated_gross_weight_grams",
  DROP COLUMN "estimated_volume_cm3",
  DROP COLUMN "estimated_height_mm",
  DROP COLUMN "estimated_width_mm",
  DROP COLUMN "estimated_length_mm",
  DROP COLUMN "unit_measurement_source",
  DROP COLUMN "unit_gross_weight_grams",
  DROP COLUMN "unit_height_mm",
  DROP COLUMN "unit_width_mm",
  DROP COLUMN "unit_length_mm";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260922140709_package_box_unit_and_estimate';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one package_box_unit_and_estimate journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
