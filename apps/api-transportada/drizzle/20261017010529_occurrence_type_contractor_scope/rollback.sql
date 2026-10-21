-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Tira o escopo de contratantes do tipo de ocorrencia.
-- ATENCAO: as listas de contratantes sao descartadas de proposito; todo tipo volta a valer para todas as contratantes.
BEGIN;

SET LOCAL lock_timeout = '3s';

DROP TABLE "company_occurrence_type_contractors";
ALTER TABLE "company_occurrence_types" DROP CONSTRAINT "company_occurrence_types_contractor_scope_check";
ALTER TABLE "company_occurrence_types" DROP COLUMN "contractor_scope";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261017010529_occurrence_type_contractor_scope';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one occurrence_type_contractor_scope journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
