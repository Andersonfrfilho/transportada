-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 295 Fase 4: remove a origem da foto de perfil. A foto fica; só se perde a distinção cnh/self/admin.
BEGIN;

SET LOCAL lock_timeout = '3s';

ALTER TABLE "identity_user_pictures" DROP CONSTRAINT "identity_user_pictures_origin_check";
ALTER TABLE "identity_user_pictures" DROP COLUMN "origin";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261105113107_user_picture_origin';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one user_picture_origin journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
