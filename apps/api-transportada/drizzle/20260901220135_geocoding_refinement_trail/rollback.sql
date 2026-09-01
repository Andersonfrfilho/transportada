-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Remove a trilha da marca de endereço (spec 069, RF10).
--
-- ⚠️ **O histórico se perde com a tabela**, e ele não é reconstituível: quem marcou, quando, e o que
-- o provedor respondeu não estão em lugar nenhum além daqui. As coordenadas que a marca comprou
-- **ficam** — elas vivem em `geocoded_addresses` e são permanentes por decisão da ADR-0044 §3.
--
-- O que se perde junto é o teto por janela (RF11): sem a tabela não há como contar quantas marcas a
-- empresa fez, então a rota precisa recusar a marca enquanto isto estiver revertido — nunca aceitar
-- sem contar.
BEGIN;

DROP TABLE IF EXISTS "geocoding_refinement_requests";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260901220135_geocoding_refinement_trail';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one geocoding_refinement_trail journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
