-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz o backfill dos identificadores de login.
--
-- ⚠️ Apaga **todos** os identificadores, não só os que este backfill criou: a tabela é projeção da
-- ficha e é reconstruída na escrita seguinte de cada perfil, então não há o que preservar aqui. O
-- que se perde até a próxima escrita é o atalho da tela de login, nunca o acesso — quem entra pelo
-- login canônico continua entrando.
BEGIN;

DELETE FROM "login_identifiers";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260831170000_login_identifier_backfill';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one login_identifier_backfill journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
