-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverts the profile table that holds the name and masked contact address shown by the user
-- administration listing.
-- Destructive: dropping the table discards the name and contact registered for every convidado
-- and membro ativo. A pessoa some da listagem de administração até ser reconvidada.
BEGIN;

DROP TABLE IF EXISTS "identity_user_profiles";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260805165955_identity_user_profiles'
      AND "hash" = '2b18a3efcf8cf806311f8b42d8a09fee81285685387446e85606d16f7bb70bd8';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one identity_user_profiles migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
