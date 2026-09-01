-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverte a spec 066: o que o OCR leu deixa de ser guardado no documento do agregado.
--
-- Perda de dado: a coluna guarda a leitura feita no upload, e ela nao e reconstruivel sem
-- reprocessar os arquivos. A revisao manual continua funcionando sem ela — volta a ser o
-- comportamento anterior, em que a divergencia so existia no instante do envio.
BEGIN;

ALTER TABLE "aggregate_documents" DROP COLUMN IF EXISTS "extracted_fields";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "hash" = 'f4e1a690202b339f010b4168837dde1bdbdad5da7e47e6933270c8d2ac1b06b7';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one mushy_invaders migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
