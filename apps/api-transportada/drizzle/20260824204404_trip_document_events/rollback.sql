-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Remove trip_document_events e o vínculo trip_documents.stop_id. A tabela é a trilha de auditoria
-- da separação (ADR-0043 §4) — recusa rodar se ela já tiver qualquer linha, porque apagar história
-- de quem separou o quê e quando é decisão humana, nunca automática.
BEGIN;

DO $$
DECLARE
  recorded_events integer;
BEGIN
  SELECT count(*) INTO recorded_events FROM "trip_document_events";

  IF recorded_events > 0 THEN
    RAISE EXCEPTION 'Refusing to roll back: % trip_document_event(s) already recorded',
      recorded_events;
  END IF;
END
$$;

ALTER TABLE "trip_documents" DROP CONSTRAINT "trip_documents_company_stop_fk";
DROP INDEX "trip_documents_company_stop_idx";
ALTER TABLE "trip_documents" DROP COLUMN "stop_id";

DROP TABLE "trip_document_events";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260824204404_trip_document_events'
      AND "hash" = 'fe1c1cfc38e67b72b20b3be8bb2eecbabb8b898e0f6a2f4f15ea8932e3a8006f';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_document_events migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
