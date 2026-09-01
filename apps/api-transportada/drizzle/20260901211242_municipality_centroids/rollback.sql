-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Remove o centroide de município, o último degrau da cascata de geocodificação (spec 069).
--
-- Aqui não há trabalho humano a lamentar: o conteúdo é a divisão territorial do IBGE, dado público
-- que o seed refaz por use case. É o oposto de `geocoded_addresses`, que acumula o pino arrastado
-- pelo conferente e nunca deve cair assim.
--
-- O que se perde enquanto a tabela não existir é o degrau final: endereço que nem o provedor nem o
-- CEP resolvem passa a não entrar no mapa de saída, e a parada fica sem coordenada em vez de entrar
-- marcada. Ela continua fora da otimização nos dois casos — a diferença é o que a tela mostra.
BEGIN;

DROP TABLE IF EXISTS "municipality_centroids";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260901211242_municipality_centroids';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one municipality_centroids journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
