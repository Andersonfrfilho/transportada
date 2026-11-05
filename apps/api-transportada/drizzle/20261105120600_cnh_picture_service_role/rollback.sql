-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 295: remove o papel `cnh-picture-service`. Recusa se alguma membership ou grupo ainda o usa.
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  affected integer;
BEGIN
  SELECT count(*) INTO affected FROM "membership_roles" WHERE "role" = 'cnh-picture-service';
  IF affected > 0 THEN
    RAISE EXCEPTION 'Service account memberships in cnh-picture-service: %. Decide their fate before rolling back.', affected;
  END IF;
  SELECT count(*) INTO affected FROM "company_group_roles" WHERE "role" = 'cnh-picture-service';
  IF affected > 0 THEN
    RAISE EXCEPTION 'Group roles in cnh-picture-service: %. Decide their fate before rolling back.', affected;
  END IF;
END
$$;

ALTER TABLE "membership_roles"
  DROP CONSTRAINT "membership_roles_role_check",
  ADD CONSTRAINT "membership_roles_role_check" CHECK ("role" in ('company-admin', 'finance', 'fiscal', 'operator', 'viewer', 'driver', 'aggregate', 'separator', 'helper', 'contractor', 'automation'));

ALTER TABLE "company_group_roles"
  DROP CONSTRAINT "company_group_roles_role_check",
  ADD CONSTRAINT "company_group_roles_role_check" CHECK ("role" in ('company-admin', 'finance', 'fiscal', 'operator', 'viewer', 'driver', 'aggregate', 'separator', 'helper', 'contractor', 'automation'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261105120600_cnh_picture_service_role';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one cnh_picture_service_role journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
