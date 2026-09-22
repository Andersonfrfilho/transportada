-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 155 T2.1 (a origem `replicated` e o vinculo da replica com a caixa de origem).
--
-- ⚠️ Este rollback FALHA se alguma caixa ou linha de historico ja tiver origem `replicated`: os
-- checks antigos nao aceitam o valor, e apagar a proveniencia deixaria medida copiada passando por
-- medida conferida. Nesse caso nao desfaca — a origem nova so alarga o que ja existia.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "nfe_package_boxes" WHERE "measurement_source" = 'replicated'
  ) THEN
    RAISE EXCEPTION 'nfe_package_boxes has rows with measurement_source replicated, refusing rollback';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "nfe_package_box_measurements" WHERE "source" = 'replicated'
  ) THEN
    RAISE EXCEPTION 'nfe_package_box_measurements has replicated rows, refusing rollback';
  END IF;
END
$$;

ALTER TABLE "nfe_package_box_measurements" DROP CONSTRAINT "nfe_package_box_measurements_replicated_from_check";
ALTER TABLE "nfe_package_box_measurements" DROP CONSTRAINT "nfe_package_box_measurements_company_replicated_from_fk";
ALTER TABLE "nfe_package_box_measurements" DROP COLUMN "replicated_from_box_id";

ALTER TABLE "nfe_package_box_measurements" DROP CONSTRAINT "nfe_package_box_measurements_source_check", ADD CONSTRAINT "nfe_package_box_measurements_source_check" CHECK ("source" in ('typed', 'camera', 'camera_adjusted'));
ALTER TABLE "nfe_package_box_measurements" DROP CONSTRAINT "nfe_package_box_measurements_typed_pairing_check", ADD CONSTRAINT "nfe_package_box_measurements_typed_pairing_check" CHECK ("source" <> 'typed' or ("length_margin_mm" is null and "width_margin_mm" is null and "height_margin_mm" is null and "proposed_length_mm" is null and "proposed_width_mm" is null and "proposed_height_mm" is null and "engine" is null));
ALTER TABLE "nfe_package_box_measurements" DROP CONSTRAINT "nfe_package_box_measurements_camera_engine_check", ADD CONSTRAINT "nfe_package_box_measurements_camera_engine_check" CHECK ("source" = 'typed' or "engine" is not null);
ALTER TABLE "nfe_package_boxes" DROP CONSTRAINT "nfe_package_boxes_measurement_source_check", ADD CONSTRAINT "nfe_package_boxes_measurement_source_check" CHECK ("measurement_source" is null or "measurement_source" in ('typed', 'camera', 'camera_adjusted'));
ALTER TABLE "nfe_package_boxes" DROP CONSTRAINT "nfe_package_boxes_measurement_margin_pairing_check", ADD CONSTRAINT "nfe_package_boxes_measurement_margin_pairing_check" CHECK ("measurement_source" <> 'typed' or "measurement_margin_mm" is null);

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260917153054_package_box_replicated_source';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one package_box_replicated_source journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
