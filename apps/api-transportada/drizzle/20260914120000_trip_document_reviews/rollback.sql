-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Remove a fila de revisão das notas que não couberam (spec 148 T7).
--
-- ⚠️ Entrada `pending` se perde com a tabela: a nota continua solta (`trip_documents.released_at`),
-- disponível para a montagem de roteiro como qualquer nota fora de viagem (D12), mas sai da fila e
-- perde o motivo. Exporte as pendentes antes de desfazer em ambiente com uso real.
BEGIN;

DROP TABLE IF EXISTS "trip_document_reviews";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260914120000_trip_document_reviews';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_document_reviews journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
