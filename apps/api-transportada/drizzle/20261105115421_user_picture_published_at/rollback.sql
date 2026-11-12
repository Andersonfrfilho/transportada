-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 295: remove a marca de publicação da foto da CNH. A foto fica; o backfill deixa de saber o que falta publicar.
BEGIN;

SET LOCAL lock_timeout = '3s';

ALTER TABLE "identity_user_pictures" DROP COLUMN "published_at";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261105115421_user_picture_published_at';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one user_picture_published_at journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
