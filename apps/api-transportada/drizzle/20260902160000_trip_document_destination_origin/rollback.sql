-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Remove a origem do endereco fisico do vinculo (spec 073, T019).
--
-- O que se perde: a tela volta a nao dizer por que o motorista foi parar naquele portao. A origem
-- e derivavel da nota — o vinculo seguinte a recalcula —, entao nao ha dado humano aqui.

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260902160000_trip_document_destination_origin';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_document_destination_origin journal entry, removed %',
      deleted_migrations;
  END IF;
END $$;

ALTER TABLE "trip_documents"
	DROP CONSTRAINT IF EXISTS "trip_documents_destination_origin_check";

ALTER TABLE "trip_documents"
	DROP COLUMN IF EXISTS "destination_origin";
