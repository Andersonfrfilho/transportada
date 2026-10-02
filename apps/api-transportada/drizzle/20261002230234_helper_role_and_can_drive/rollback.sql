-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 234: tira o papel 'helper' dos três CHECKs de papel e apaga `fleet_drivers.can_drive`
-- com o CHECK da D2.
-- Recusa rodar enquanto existir vínculo, convite ou grupo com o papel 'helper', ou ficha que não
-- dirige: estreitar o CHECK falharia com erro do Postgres, e apagar a coluna faria um ajudante-puro
-- voltar a ser condutor sem ninguém decidir. Para prosseguir, decida o que fazer com essas linhas:
-- select membership_id from membership_roles where role = 'helper';
-- select invitation_id from user_invitation_roles where role = 'helper';
-- select group_id from company_group_roles where role = 'helper';
-- select id from fleet_drivers where can_drive = false;
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "membership_roles" WHERE "role" = 'helper') THEN
    RAISE EXCEPTION 'membership_roles has helper rows, refusing rollback';
  END IF;
  IF EXISTS (SELECT 1 FROM "user_invitation_roles" WHERE "role" = 'helper') THEN
    RAISE EXCEPTION 'user_invitation_roles has helper rows, refusing rollback';
  END IF;
  IF EXISTS (SELECT 1 FROM "company_group_roles" WHERE "role" = 'helper') THEN
    RAISE EXCEPTION 'company_group_roles has helper rows, refusing rollback';
  END IF;
  IF EXISTS (SELECT 1 FROM "fleet_drivers" WHERE "can_drive" = false) THEN
    RAISE EXCEPTION 'fleet_drivers has can_drive = false rows, refusing rollback';
  END IF;
END
$$;

ALTER TABLE "user_invitation_roles"
  DROP CONSTRAINT "user_invitation_roles_role_check",
  ADD CONSTRAINT "user_invitation_roles_role_check" CHECK ("role" in ('company-admin', 'finance', 'fiscal', 'operator', 'viewer', 'driver', 'aggregate', 'separator', 'contractor'));

ALTER TABLE "membership_roles"
  DROP CONSTRAINT "membership_roles_role_check",
  ADD CONSTRAINT "membership_roles_role_check" CHECK ("role" in ('company-admin', 'finance', 'fiscal', 'operator', 'viewer', 'driver', 'aggregate', 'separator', 'contractor', 'automation'));

ALTER TABLE "company_group_roles"
  DROP CONSTRAINT "company_group_roles_role_check",
  ADD CONSTRAINT "company_group_roles_role_check" CHECK ("role" in ('company-admin', 'finance', 'fiscal', 'operator', 'viewer', 'driver', 'aggregate', 'separator', 'contractor', 'automation'));

ALTER TABLE "fleet_drivers" DROP CONSTRAINT "fleet_drivers_crew_capability_check";

ALTER TABLE "fleet_drivers" DROP COLUMN "can_drive";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261002230234_helper_role_and_can_drive';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one helper_role_and_can_drive journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
