-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 315: remove o contratante gravado no recibo de XML do WhatsApp.
--
-- ⚠️ Só com aprovação humana. Recusa-se a rodar com restrição gravada: apagar a coluna perde a quem o recibo pertencia.
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  restricted_receipts integer;
BEGIN
  SELECT count(*) INTO restricted_receipts FROM "nfe_xml_receipts" WHERE "restricted_contractor_id" IS NOT NULL;
  IF restricted_receipts > 0 THEN
    RAISE EXCEPTION 'nfe_xml_receipts has % restricted rows; refusing to drop restricted_contractor_id', restricted_receipts;
  END IF;
END
$$;

ALTER TABLE "nfe_xml_receipts" DROP CONSTRAINT "nfe_xml_receipts_restricted_contractor_id_contractors_id_fkey";
ALTER TABLE "nfe_xml_receipts" DROP COLUMN "restricted_contractor_id";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261110011749_nfe_xml_receipt_restricted_contractor';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one nfe_xml_receipt_restricted_contractor journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
