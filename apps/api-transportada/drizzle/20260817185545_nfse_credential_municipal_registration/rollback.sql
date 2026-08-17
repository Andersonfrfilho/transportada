-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Devolve o padrão vazio da inscrição municipal e solta a restrição de conteúdo.
-- É reversível de verdade: a migration não apagou nem reescreveu linha nenhuma — o que volta é a
-- permissividade, não um dado perdido.
BEGIN;

ALTER TABLE "nfse_provider_credentials" DROP CONSTRAINT "nfse_provider_credentials_municipal_registration_check";

ALTER TABLE "nfse_provider_credentials" ALTER COLUMN "municipal_registration" SET DEFAULT '';

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260817185545_nfse_credential_municipal_registration'
      AND "hash" = 'e2a45e96ffe05323f78298a0628a32f5316fcd048f6f3656f2149483553ccdc4';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one nfse_credential_municipal_registration migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
