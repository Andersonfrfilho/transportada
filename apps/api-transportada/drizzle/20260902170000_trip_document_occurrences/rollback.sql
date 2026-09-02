-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Devolve o schema ao estado anterior. ⚠️ As ocorrencias registradas se perdem: a tabela e
-- append-only e nao ha para onde copiar o que ela guardava.
--
-- ⚠️ A linha do journal sai ANTES do DROP, e a contagem e conferida. Derrubar a tabela deixando o
-- registro faz o proximo `db:migrate` PULAR esta migration: ela consta como aplicada e a tabela
-- nao existe, sem nada avisando, ate a primeira escrita quebrar.

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260902170000_trip_document_occurrences';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_document_occurrences journal entry, removed %',
      deleted_migrations;
  END IF;
END $$;

DROP TABLE IF EXISTS "trip_document_occurrences";
