-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 313: remove o vínculo do domínio liberado com o contratante.
--
-- ⚠️ Só com aprovação humana. Recusa-se a rodar com vínculo gravado: apagar a coluna perde a quem cada domínio pertence.
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  linked_domains integer;
BEGIN
  SELECT count(*) INTO linked_domains FROM "nfe_xml_allowed_email_domains" WHERE "contractor_id" IS NOT NULL;
  IF linked_domains > 0 THEN
    RAISE EXCEPTION 'nfe_xml_allowed_email_domains has % linked rows; refusing to drop contractor_id', linked_domains;
  END IF;
END
$$;

ALTER TABLE "nfe_xml_allowed_email_domains" DROP CONSTRAINT "nfe_xml_allowed_email_domains_contractor_id_contractors_id_fkey";
ALTER TABLE "nfe_xml_allowed_email_domains" DROP COLUMN "contractor_id";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261109192917_nfe_xml_allowed_domain_contractor';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one nfe_xml_allowed_domain_contractor journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
