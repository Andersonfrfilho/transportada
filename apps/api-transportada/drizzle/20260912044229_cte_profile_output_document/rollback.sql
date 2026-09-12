-- Devolve o esquema anterior. ⚠️ As colunas saem com os valores: perfil que estava em `nfse` volta a
-- emitir CT-e, e a escolha do documento e do perfil NFS-e precisa ser refeita.
DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260912044229_cte_profile_output_document';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one cte_profile_output_document journal entry, removed %',
      deleted_migrations;
  END IF;
END $$;

ALTER TABLE "cte_emission_profiles"
  DROP CONSTRAINT IF EXISTS "cte_emission_profiles_output_municipal_check";

ALTER TABLE "cte_emission_profiles"
  DROP CONSTRAINT IF EXISTS "cte_emission_profiles_nfse_profile_check";

ALTER TABLE "cte_emission_profiles"
  DROP CONSTRAINT IF EXISTS "cte_emission_profiles_output_document_check";

ALTER TABLE "cte_emission_profiles"
  DROP CONSTRAINT IF EXISTS "cte_emission_profiles_company_nfse_profile_fk";

ALTER TABLE "cte_emission_profiles"
  DROP COLUMN IF EXISTS "nfse_emission_profile_id";

ALTER TABLE "cte_emission_profiles"
  DROP COLUMN IF EXISTS "output_document";
