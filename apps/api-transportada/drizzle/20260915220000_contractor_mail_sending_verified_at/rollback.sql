-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 150 T401: a coluna `contractor_mail_settings.sending_verified_at`. Perde só o
-- instante da última verificação de envio — a lista de verificação da página grava de novo quando
-- a coluna voltar. ⚠️ Com a coluna fora, a API da T401 não sobe: reverta o código junto.
BEGIN;

ALTER TABLE "contractor_mail_settings" DROP COLUMN IF EXISTS "sending_verified_at";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260915220000_contractor_mail_sending_verified_at';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one contractor_mail_sending_verified_at journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
