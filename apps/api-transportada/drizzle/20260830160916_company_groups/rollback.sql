-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverte os grupos da empresa: papéis e permissões voltam a vir só do catálogo fixo.
--
-- ⚠️ Reverter isto **apaga grupo, vínculo e permissão avulsa**, e nada os devolve: são dado que a
-- empresa criou, não estrutura derivável. Quem reverter em ambiente com grupo em uso tira acesso de
-- quem dependia deles, e a única pista do que existia é a trilha de auditoria.
--
-- No Keycloak, o grupo correspondente **não** é apagado por esta migration: ele vive no provedor, e
-- limpá-lo é operação de lá.
BEGIN;

DROP TABLE IF EXISTS "membership_permissions";
DROP TABLE IF EXISTS "membership_groups";
DROP TABLE IF EXISTS "company_group_permissions";
DROP TABLE IF EXISTS "company_group_roles";
DROP TABLE IF EXISTS "company_groups";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260830160916_company_groups'
      AND "hash" = '113e90063b78d4dacb83a6a3a534578549103177edec391e1f430dde20b43179';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one company_groups migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
