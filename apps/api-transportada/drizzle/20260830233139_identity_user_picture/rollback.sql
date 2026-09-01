-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverte a foto de perfil.
--
-- ⚠️ Apaga as fotos, e nada as devolve: os bytes moram só aqui. O atributo `picture` do realm
-- continua apontando para a rota de leitura, que passa a responder 404 — quem reverter deve limpar
-- o atributo das contas afetadas, senão o avatar do token aponta para lugar nenhum.
BEGIN;

DROP TABLE IF EXISTS "identity_user_pictures";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260830233139_identity_user_picture'
      AND "hash" = '73ed9fc5a307a99e84c254c48635ad8c3e0950818609f8fc7bf4e2916bbffd22';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one identity_user_picture migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
