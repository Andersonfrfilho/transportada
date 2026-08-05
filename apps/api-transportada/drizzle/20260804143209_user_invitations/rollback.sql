-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverts the invitation tables that hold the hashed activation code, the intended company roles,
-- the validity window and the attempt counter of each first access.
-- Destructive: dropping the tables discards every pending invitation. The codes already sent stop
-- working with no trace of who was invited, and each person has to be invited again from scratch.
BEGIN;

DROP TABLE IF EXISTS "user_invitation_roles";

DROP TABLE IF EXISTS "user_invitations";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260804143209_user_invitations'
      AND "hash" = '52f6cf752c68241913b5cb9bd950ea8092d6a919e244a260724495abcf00c35a';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one user_invitations migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
