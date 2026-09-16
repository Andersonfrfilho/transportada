-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 152 (origem/margem da medida, historico e o interruptor por empresa).
--
-- ⚠️ Este rollback FALHA se alguma caixa ja tiver `measurement_source`/`measurement_margin_mm`
-- gravados, ou se o historico ja tiver linha — a origem so nasce depois desta migration, e apagar
-- a coluna/tabela com dado dentro apagaria fato de auditoria (R5). Nesse caso não desfaça: a função
-- segue experimental e desligada por padrão (D14), então não há urgência em reverter o schema.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "nfe_package_boxes" WHERE "measurement_source" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'nfe_package_boxes has rows with measurement_source set, refusing rollback';
  END IF;

  IF EXISTS (SELECT 1 FROM "nfe_package_box_measurements") THEN
    RAISE EXCEPTION 'nfe_package_box_measurements has rows, refusing rollback';
  END IF;
END
$$;

-- A tabela nova sai primeiro: a FK composta dela depende do índice da UNIQUE abaixo
-- (nfe_package_box_measurements_company_package_box_fk usa nfe_package_boxes_company_id_id_unique
-- como índice de apoio), e o Postgres recusa derrubar um índice com dependente vivo.
DROP TABLE "nfe_package_box_measurements";

ALTER TABLE "nfe_package_boxes" DROP CONSTRAINT "nfe_package_boxes_measurement_margin_pairing_check";
ALTER TABLE "nfe_package_boxes" DROP CONSTRAINT "nfe_package_boxes_measurement_source_pairing_check";
ALTER TABLE "nfe_package_boxes" DROP CONSTRAINT "nfe_package_boxes_measurement_margin_check";
ALTER TABLE "nfe_package_boxes" DROP CONSTRAINT "nfe_package_boxes_measurement_source_check";
ALTER TABLE "nfe_package_boxes" DROP CONSTRAINT "nfe_package_boxes_company_id_id_unique";

ALTER TABLE "company_cargo_settings" DROP COLUMN "camera_measurement_enabled";
ALTER TABLE "nfe_package_boxes" DROP COLUMN "measurement_margin_mm";
ALTER TABLE "nfe_package_boxes" DROP COLUMN "measurement_source";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260916000000_nfe_package_box_measurement_source';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one nfe_package_box_measurement_source journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
