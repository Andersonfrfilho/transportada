-- Devolve o esquema anterior. ⚠️ A coluna sai com os valores: perfil que estava em `block` volta a
-- aceitar serviço municipal no lote, e a escolha precisa ser refeita.
DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260906140000_cte_profile_municipal_service_policy';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one cte_profile_municipal_service_policy journal entry, removed %',
      deleted_migrations;
  END IF;
END $$;

ALTER TABLE "cte_emission_profiles"
  DROP CONSTRAINT IF EXISTS "cte_emission_profiles_municipal_service_policy_check";

ALTER TABLE "cte_emission_profiles"
  DROP COLUMN IF EXISTS "municipal_service_policy";
