-- Copyright (c) 2026 Ada Technology. MIT License.
-- Spec 237 (revisão de segurança da Fase 4a, S1/S2): três códigos novos de prévia que falhou —
-- `PREVIEW_TOO_MANY_CELLS` (teto de células do leitor), `PREVIEW_PROCESSING_INTERRUPTED` (a leitura
-- caiu no meio e a mensagem voltou: não se relê) e `PREVIEW_MATCH_TIMEOUT` (o vínculo passou do
-- orçamento). Aditiva: só alarga a lista do CHECK.
-- Lock: ACCESS EXCLUSIVE em `cargo_previews` enquanto o CHECK novo confere as linhas (tabela pequena).
ALTER TABLE "cargo_previews" DROP CONSTRAINT "cargo_previews_error_code_check", ADD CONSTRAINT "cargo_previews_error_code_check" CHECK ("error_code" in ('PREVIEW_CELL_TOO_LONG', 'PREVIEW_COLUMN_DUPLICATED', 'PREVIEW_COLUMN_NOT_FOUND', 'PREVIEW_FILE_CORRUPTED', 'PREVIEW_FILE_MISSING', 'PREVIEW_FILE_TOO_LARGE', 'PREVIEW_MATCH_TIMEOUT', 'PREVIEW_NOT_A_WORKBOOK', 'PREVIEW_NOT_ENABLED', 'PREVIEW_PARSE_TIMEOUT', 'PREVIEW_PROCESSING_ABANDONED', 'PREVIEW_PROCESSING_INTERRUPTED', 'PREVIEW_SHEET_NOT_FOUND', 'PREVIEW_TOO_MANY_CELLS', 'PREVIEW_TOO_MANY_ENTRIES', 'PREVIEW_TOO_MANY_ROWS', 'PREVIEW_TOO_MANY_STRINGS', 'PREVIEW_VALUE_OUT_OF_RANGE', 'PREVIEW_ZIP_BOMB', 'PREVIEW_ZIP_ENTRY_UNSAFE'));