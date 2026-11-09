-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 311: remove a lista de domínios de e-mail liberados a enviar XML de NF-e.
--
-- ⚠️ Só com aprovação humana. Recusa-se a rodar com domínio cadastrado: apagar a lista revoga o envio de quem
-- depende dela, e isso é decisão de quem cuida da empresa, não do rollback.
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  stored_domains integer;
BEGIN
  SELECT count(*) INTO stored_domains FROM "nfe_xml_allowed_email_domains";
  IF stored_domains > 0 THEN
    RAISE EXCEPTION 'nfe_xml_allowed_email_domains has % rows; refusing to drop', stored_domains;
  END IF;
END
$$;

DROP TABLE "nfe_xml_allowed_email_domains";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261109133052_nfe_xml_allowed_email_domains';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one nfe_xml_allowed_email_domains journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
