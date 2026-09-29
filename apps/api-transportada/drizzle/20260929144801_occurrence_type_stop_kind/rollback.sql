-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 218 D2: tira a coluna `stop_kind` de `company_occurrence_types`. Nenhum dado de
-- ocorrência se perde — `trip_stop_occurrences.kind` continua gravado em toda linha.
BEGIN;

ALTER TABLE "company_occurrence_types"
  DROP CONSTRAINT IF EXISTS "company_occurrence_types_stop_kind_check";

ALTER TABLE "company_occurrence_types" DROP COLUMN IF EXISTS "stop_kind";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260929144801_occurrence_type_stop_kind';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one occurrence_type_stop_kind journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
