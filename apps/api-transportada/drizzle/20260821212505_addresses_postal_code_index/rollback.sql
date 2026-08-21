-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Retira os cinco índices por CEP das quatro origens de endereço. Não perde dado: índice é derivado
-- da tabela. O que volta é o plano de varredura completa na consulta da sugestão de endereço.
BEGIN;

DROP INDEX IF EXISTS "nfe_addresses_company_postal_code_idx";

DROP INDEX IF EXISTS "fleet_drivers_company_postal_code_idx";

DROP INDEX IF EXISTS "company_fiscal_profiles_company_postal_code_idx";

DROP INDEX IF EXISTS "mdfe_manifests_company_loading_postal_code_idx";

DROP INDEX IF EXISTS "mdfe_manifests_company_discharge_postal_code_idx";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260821212505_addresses_postal_code_index'
      AND "hash" = '98e8683cd8c69166da324a7f561be29524a5c6df478f476e59fc778d219d7ffe';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one addresses_postal_code_index migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
