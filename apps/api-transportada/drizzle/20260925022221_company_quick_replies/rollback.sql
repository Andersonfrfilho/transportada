-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz a spec 183 T701 (RF12): as respostas rápidas da empresa. O que se perde são os textos
-- cadastrados; nenhuma mensagem aponta para eles (o compositor copia o texto), então a conversa
-- inteira fica.

BEGIN;

DROP TABLE IF EXISTS "company_quick_replies";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260925022221_company_quick_replies';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one company_quick_replies migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
