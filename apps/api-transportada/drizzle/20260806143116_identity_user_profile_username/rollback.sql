-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverts the application-side login column of the user administration profile.
-- Destructive: perde-se o login que o administrador tiver trocado depois da migration. O login em
-- si continua existindo no Keycloak, que é a autoridade dele.
BEGIN;

ALTER TABLE "identity_user_profiles" DROP CONSTRAINT IF EXISTS "identity_user_profiles_username_key";
ALTER TABLE "identity_user_profiles" DROP COLUMN IF EXISTS "username";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260806143116_identity_user_profile_username'
      AND "hash" = 'de1e619ad3d2c7fae89d2ecdacd0946dd4ddd8802701dd713124aef615cb6441';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one identity_user_profile_username migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
