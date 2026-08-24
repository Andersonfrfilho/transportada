-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Devolve trip_documents_company_stop_fk a ON DELETE SET NULL. Não recuar de propósito: numa FK
-- composta, SET NULL zera company_id junto com stop_id, e company_id é NOT NULL — é exatamente o
-- bug que esta migration corrigiu (achado pela T010 tentando apagar uma parada de verdade).
BEGIN;

ALTER TABLE "trip_documents" DROP CONSTRAINT "trip_documents_company_stop_fk",
  ADD CONSTRAINT "trip_documents_company_stop_fk" FOREIGN KEY ("company_id", "stop_id")
    REFERENCES "trip_stops"("company_id", "id") ON DELETE SET NULL ON UPDATE CASCADE;

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260824233118_trip_documents_stop_fk_restrict'
      AND "hash" = '858c096f5bb19c272390cb218599cfab0475da93f827a15d019c8fab76877f6d';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_documents_stop_fk_restrict migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
