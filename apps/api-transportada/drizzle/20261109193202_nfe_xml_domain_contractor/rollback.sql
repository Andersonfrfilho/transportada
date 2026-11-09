-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 314: o domínio liberado de XML passa a poder ser amarrado a um contratante.
--
-- ⚠️ Só com aprovação humana. Voltar libera de novo o domínio para qualquer emitente.
BEGIN;

SET LOCAL lock_timeout = '3s';

ALTER TABLE "nfe_xml_allowed_email_domains" DROP CONSTRAINT "nfe_xml_allowed_email_domains_contractor_id_contractors_id_fkey";
ALTER TABLE "nfe_xml_allowed_email_domains" DROP COLUMN "contractor_id";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261109193202_nfe_xml_domain_contractor';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one nfe_xml_domain_contractor journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
