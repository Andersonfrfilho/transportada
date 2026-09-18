-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 156 T7b: a coluna `attachment_object_id` de `trip_document_occurrences` e a FK
-- composta para `stored_objects` (D7 §3.5, a foto opcional do lote de ocorrência em massa).
--
-- ⚠️ Aditiva por desenho: a coluna é nullable e nada além dela depende da FK. Rollback só falha se
-- alguma linha já tiver anexo gravado — nesse caso a foto se perderia, e o rollback recusa.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "trip_document_occurrences"
    WHERE "attachment_object_id" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'trip_document_occurrences has attachment rows, refusing rollback';
  END IF;
END
$$;

ALTER TABLE "trip_document_occurrences" DROP CONSTRAINT "trip_document_occurrences_company_object_fk";
ALTER TABLE "trip_document_occurrences" DROP COLUMN "attachment_object_id";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260918084711_trip_document_occurrence_attachment';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_document_occurrence_attachment journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
