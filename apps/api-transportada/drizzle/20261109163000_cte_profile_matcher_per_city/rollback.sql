-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 312: o mesmo CNPJ passa a poder estar em mais de um perfil quando as listas de cidades não se cruzam.
--
-- ⚠️ Só com aprovação humana. Recusa-se a rodar se já existe o mesmo CNPJ e papel em dois perfis: recriar a
-- unicidade falharia, e apagar um deles mudaria o percentual cobrado.
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  repeated integer;
BEGIN
  SELECT count(*) INTO repeated FROM (
    SELECT 1 FROM "cte_emission_profile_matchers"
    GROUP BY "company_id", "tax_id", "match_role" HAVING count(*) > 1
  ) duplicated;
  IF repeated > 0 THEN
    RAISE EXCEPTION '% tax id and role pairs are in more than one CT-e profile; refusing to restore uniqueness', repeated;
  END IF;
END
$$;

ALTER TABLE "cte_emission_profile_matchers"
  ADD CONSTRAINT "cte_emission_profile_matchers_company_tax_id_role_unique" UNIQUE ("company_id", "tax_id", "match_role");

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261109163000_cte_profile_matcher_per_city';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one cte_profile_matcher_per_city journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
