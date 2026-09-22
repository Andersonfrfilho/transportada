-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 162 (alarga as CHECKs de source/measurement_source para aceitar 'catalog').
--
-- ⚠️ Este rollback FALHA se alguma caixa ou linha de historico ja tiver origem `catalog`: os
-- checks antigos nao aceitam o valor, e apagar a proveniencia deixaria proposta/promocao de
-- catalogo passando por medida conferida. Nesse caso nao desfaca — a origem nova so alarga o que
-- ja existia.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "nfe_package_boxes" WHERE "measurement_source" = 'catalog'
  ) THEN
    RAISE EXCEPTION 'nfe_package_boxes has rows with measurement_source catalog, refusing rollback';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "nfe_package_box_measurements" WHERE "source" = 'catalog'
  ) THEN
    RAISE EXCEPTION 'nfe_package_box_measurements has catalog rows, refusing rollback';
  END IF;
END
$$;

ALTER TABLE "nfe_package_box_measurements" DROP CONSTRAINT "nfe_package_box_measurements_source_check", ADD CONSTRAINT "nfe_package_box_measurements_source_check" CHECK ("source" in ('typed', 'camera', 'camera_adjusted', 'replicated'));
ALTER TABLE "nfe_package_boxes" DROP CONSTRAINT "nfe_package_boxes_measurement_source_check", ADD CONSTRAINT "nfe_package_boxes_measurement_source_check" CHECK ("measurement_source" is null or "measurement_source" in ('typed', 'camera', 'camera_adjusted', 'replicated'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260922024059_package_box_catalog_source';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one package_box_catalog_source journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
