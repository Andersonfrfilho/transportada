-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 294 T4.8: remove a tabela das perguntas do canhoto. As fotos pendentes ficam órfãs no bucket (chave
-- `whatsapp-delivery-preparations/<id>`): conferir antes e apagá-las à mão.
BEGIN;

SET LOCAL lock_timeout = '3s';

DROP TABLE "whatsapp_canhoto_questions";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261105121200_whatsapp_canhoto_questions';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one whatsapp_canhoto_questions journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
