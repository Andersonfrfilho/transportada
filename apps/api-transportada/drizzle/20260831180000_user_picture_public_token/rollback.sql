-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Remove o endereço público da foto de perfil.
--
-- ⚠️ Os links já publicados no atributo `picture` do realm deixam de abrir, e nada os devolve: o
-- token é a única coisa que os torna alcançáveis. A foto continua aqui, servida pela rota
-- autenticada — o que se perde é o endereço sem login.
BEGIN;

ALTER TABLE "identity_user_pictures" DROP CONSTRAINT IF EXISTS "identity_user_pictures_public_token_check";
ALTER TABLE "identity_user_pictures" DROP CONSTRAINT IF EXISTS "identity_user_pictures_public_token_unique";
ALTER TABLE "identity_user_pictures" DROP COLUMN IF EXISTS "public_token";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260831180000_user_picture_public_token';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one user_picture_public_token journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
