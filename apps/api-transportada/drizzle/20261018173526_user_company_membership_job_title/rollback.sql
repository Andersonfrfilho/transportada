-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Tira o cargo livre das memberships; os cargos digitados são descartados de propósito.
BEGIN;

SET LOCAL lock_timeout = '3s';

ALTER TABLE "user_company_memberships" DROP CONSTRAINT "user_company_memberships_job_title_check";
ALTER TABLE "user_company_memberships" DROP COLUMN "job_title";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261018173526_user_company_membership_job_title';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one user_company_membership_job_title journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
