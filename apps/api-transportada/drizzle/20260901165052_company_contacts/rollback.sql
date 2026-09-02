-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Remove os contatos e as redes sociais da empresa (spec 068).
--
-- ⚠️ Os telefones, e-mails e perfis cadastrados **se perdem com as tabelas**. O rodapé do e-mail e
-- o do site voltam ao contato único do cadastro fiscal e do site, e recadastrar é trabalho humano —
-- não há backfill possível a partir de um campo só.
BEGIN;

DROP TABLE IF EXISTS "company_social_links";
DROP TABLE IF EXISTS "company_contacts";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260901165052_company_contacts';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one company_contacts journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
