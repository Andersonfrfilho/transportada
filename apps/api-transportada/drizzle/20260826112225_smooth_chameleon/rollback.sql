-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverte a spec 059, fase 1: a trava de manifesto vivo, o semáforo derivado da viagem, o caminho de
-- índice da nota até o CT-e e a opção de emissão automática.
--
-- É reversão **aditiva**: nenhum manifesto, CT-e ou viagem se perde. O que volta é o risco que a
-- trava fechava — duas autorizações simultâneas voltam a poder gerar dois MDF-e para a mesma viagem,
-- que é incidente fiscal. E `automatic_mdfe_on_completion` some com a escolha de quem a ligou: quem
-- reverter precisa avisar as empresas que tinham a emissão automática ativa.
BEGIN;

ALTER TABLE "trips" DROP CONSTRAINT IF EXISTS "trips_fiscal_readiness_check";
DROP INDEX IF EXISTS "trips_company_fiscal_readiness_idx";
DROP INDEX IF EXISTS "mdfe_manifests_company_trip_live_unique";
DROP INDEX IF EXISTS "cte_batch_items_company_nfe_document_idx";
ALTER TABLE "trips" DROP COLUMN IF EXISTS "fiscal_readiness_state";
ALTER TABLE "company_fiscal_profiles" DROP COLUMN IF EXISTS "automatic_mdfe_on_completion";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260826112225_smooth_chameleon'
      AND "hash" = '3307fcaa64618946ea4728625392fb3f866b976866390aa86cb694c979d1b4a1';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one smooth_chameleon migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
