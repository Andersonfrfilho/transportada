-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Never execute this file from application startup.
BEGIN;

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
  WHERE "name" = '20260719025322_tenant_identity'
    AND "hash" = '7b8308162d50faf727dae4ca8e8bbcb3d60ec36a4b5401f6ef5efe096df012c2';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one tenant identity migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

DROP TABLE "membership_roles";
DROP TABLE "user_company_memberships";
DROP TABLE "external_identities";
DROP TABLE "companies";
DROP TABLE "identity_users";

COMMIT;
