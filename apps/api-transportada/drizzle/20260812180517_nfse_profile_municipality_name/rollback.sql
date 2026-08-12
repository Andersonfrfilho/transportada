-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz o nome do município no perfil de emissão de NFS-e. Depois deste rollback a variável
-- `{{municipio}}` da descrição deixa de ter de onde sair, e o nome precisa ser recadastrado.
BEGIN;

ALTER TABLE "nfse_emission_profiles"
  DROP CONSTRAINT IF EXISTS "nfse_emission_profiles_municipality_name_check";

ALTER TABLE "nfse_emission_profiles" DROP COLUMN IF EXISTS "municipality_name";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260812180517_nfse_profile_municipality_name'
      AND "hash" = 'bf9ce21cb8cc18033f99af1e32a33f2ee34895b6821dae4cbdeab674cebfa1e6';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one nfse_profile_municipality_name migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
