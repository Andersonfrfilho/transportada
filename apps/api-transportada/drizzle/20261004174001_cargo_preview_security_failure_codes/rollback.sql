-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a lista alargada do CHECK de `cargo_previews.error_code`. Falha (sem apagar nada) se ainda
-- houver prévia com `PREVIEW_TOO_MANY_CELLS`, `PREVIEW_PROCESSING_INTERRUPTED` ou
-- `PREVIEW_MATCH_TIMEOUT`: decida antes o que fazer com elas (reenviar o arquivo as reabre na fila).
BEGIN;

ALTER TABLE "cargo_previews" DROP CONSTRAINT IF EXISTS "cargo_previews_error_code_check";
ALTER TABLE "cargo_previews" ADD CONSTRAINT "cargo_previews_error_code_check" CHECK ("error_code" in ('PREVIEW_CELL_TOO_LONG', 'PREVIEW_COLUMN_DUPLICATED', 'PREVIEW_COLUMN_NOT_FOUND', 'PREVIEW_FILE_CORRUPTED', 'PREVIEW_FILE_MISSING', 'PREVIEW_FILE_TOO_LARGE', 'PREVIEW_NOT_A_WORKBOOK', 'PREVIEW_NOT_ENABLED', 'PREVIEW_PARSE_TIMEOUT', 'PREVIEW_PROCESSING_ABANDONED', 'PREVIEW_SHEET_NOT_FOUND', 'PREVIEW_TOO_MANY_ENTRIES', 'PREVIEW_TOO_MANY_ROWS', 'PREVIEW_TOO_MANY_STRINGS', 'PREVIEW_VALUE_OUT_OF_RANGE', 'PREVIEW_ZIP_BOMB', 'PREVIEW_ZIP_ENTRY_UNSAFE')) NOT VALID;
ALTER TABLE "cargo_previews" VALIDATE CONSTRAINT "cargo_previews_error_code_check";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261004174001_cargo_preview_security_failure_codes';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one cargo_preview_security_failure_codes journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
