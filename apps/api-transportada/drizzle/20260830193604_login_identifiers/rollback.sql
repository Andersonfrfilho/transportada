-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverte os identificadores de login (e-mail alternativo, documento, telefone).
--
-- ⚠️ Apaga o que alguém cadastrou à mão depois do seed, e nada devolve. Quem entrava pelo documento
-- ou pelo telefone volta a precisar do login canônico: o acesso não se perde, o atalho sim.
BEGIN;

DROP TABLE IF EXISTS "login_identifiers";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260830193604_login_identifiers'
      AND "hash" = '9dc4fa19fe90b0c3d8e238dcc1a9b9993eac4d5212c4331efe9f005111ffbfd7';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one login_identifiers migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
