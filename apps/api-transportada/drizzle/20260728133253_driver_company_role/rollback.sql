-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverts the driver company role back to the five office roles.
-- Destructive: every membership_roles row holding 'driver' is discarded, because the narrower
-- check cannot be restored while such a row exists. A membership left with no role keeps passing
-- tenantContext and resolves to zero permissions.
BEGIN;

DELETE FROM "membership_roles" WHERE "role" = 'driver';

ALTER TABLE "membership_roles"
  DROP CONSTRAINT "membership_roles_role_check",
  ADD CONSTRAINT "membership_roles_role_check" CHECK ("role" in ('company-admin', 'finance', 'fiscal', 'operator', 'viewer'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260728133253_driver_company_role'
      AND "hash" = 'b877e27068db42a38461377e77a6664e80bfad8180a3b725fa2a4697e948d5cb';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one driver_company_role migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
