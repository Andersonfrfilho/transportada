-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 250 T2.2: remove `national_taxation_code` e `simples_national_rate` do perfil de
-- emissão e `provider_request_key` da tentativa.
-- ⚠️ Recusa rodar enquanto houver valor gravado: o código e a alíquota alimentam o payload congelado
-- da v3, e a chave do provedor é o que impede a reemissão ambígua de duplicar a nota na Nota RP.
-- Confira antes: select id, national_taxation_code, simples_national_rate from nfse_emission_profiles
-- where national_taxation_code is not null or simples_national_rate is not null;
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  filled_profiles integer;
  filled_attempts integer;
BEGIN
  SELECT count(*) INTO filled_profiles FROM "nfse_emission_profiles"
    WHERE "national_taxation_code" IS NOT NULL OR "simples_national_rate" IS NOT NULL;
  SELECT count(*) INTO filled_attempts FROM "nfse_issuance_attempts"
    WHERE "provider_request_key" IS NOT NULL;

  IF filled_profiles > 0 OR filled_attempts > 0 THEN
    RAISE EXCEPTION 'Refusing to roll back: % profile(s) and % attempt(s) carry the new columns',
      filled_profiles, filled_attempts;
  END IF;
END
$$;

ALTER TABLE "nfse_emission_profiles" DROP CONSTRAINT "nfse_emission_profiles_simples_national_rate_check";
ALTER TABLE "nfse_emission_profiles" DROP CONSTRAINT "nfse_emission_profiles_national_taxation_code_check";
ALTER TABLE "nfse_emission_profiles" DROP COLUMN "simples_national_rate";
ALTER TABLE "nfse_emission_profiles" DROP COLUMN "national_taxation_code";
ALTER TABLE "nfse_issuance_attempts" DROP COLUMN "provider_request_key";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261007205304_nfse_national_taxation';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one nfse_national_taxation journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
