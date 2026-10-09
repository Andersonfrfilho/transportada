-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Remove o índice por (company_id, participant_id) de `nfe_addresses` (spec 252).
--
-- Só índice: nenhum dado se perde. Sem ele a descoberta de feriados do worker, o detalhe da viagem e o aviso do
-- motorista (`GET /me/trips/current`) voltam a varrer os endereços da empresa inteira a cada consulta. Serve
-- também ao índice criado à mão com CONCURRENTLY (mesmo nome).
-- `DROP INDEX` toma ACCESS EXCLUSIVE em `nfe_addresses` até o COMMIT: aborta em vez de enfileirar a leitura atrás de uma
-- transação longa.
BEGIN;

SET LOCAL lock_timeout = '3s';

DROP INDEX IF EXISTS "nfe_addresses_company_participant_idx";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261009160300_nfe_addresses_participant_index';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one nfe_addresses_participant_index journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
