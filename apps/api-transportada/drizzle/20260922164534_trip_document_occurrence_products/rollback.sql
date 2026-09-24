-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz a tabela `trip_document_occurrence_products`: os itens da nota que uma mesma ocorrência
-- aponta.
--
-- O que se perde: do segundo item em diante de cada ocorrência. O primeiro item continua em
-- `trip_document_occurrences.product_code`, que esta migration nunca deixou de escrever — é
-- exatamente por isso que ela é aditiva, e é o que faz o rollback não apagar o fato registrado,
-- só o detalhe a mais.
--
-- Recusa (RAISE) em vez de apagar dado de verdade: qualquer linha na tabela nova faz o rollback
-- parar antes de qualquer DDL.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "trip_document_occurrence_products") THEN
    RAISE EXCEPTION 'trip_document_occurrence_products has rows, refusing rollback';
  END IF;
END
$$;

DROP TABLE "trip_document_occurrence_products";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260922164534_trip_document_occurrence_products'
      AND "hash" = '9427e03ca58b0e8f545cd2b9f38a2ff24a33a4f063f89c63e134ab4411445626';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_document_occurrence_products migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
