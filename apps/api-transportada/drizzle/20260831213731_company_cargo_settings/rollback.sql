-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Remove o peso padrão por volume da empresa (spec 067).
--
-- ⚠️ Reverter isto **volta a bloquear** para CT-e toda nota cujo emitente não declarou peso: o
-- gate continua de pé, e a estimativa é a única segunda fonte dele. Os números configurados por
-- cada empresa se perdem com a tabela, e reconfigurá-los é escolha humana, não backfill.
BEGIN;

DROP TABLE IF EXISTS "company_cargo_settings";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260831213731_company_cargo_settings';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one company_cargo_settings journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
