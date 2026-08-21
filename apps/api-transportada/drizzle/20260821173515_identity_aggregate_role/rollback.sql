-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverte os dois CHECK ao catálogo sem `aggregate`. Vínculo ou convite já gravado com o papel novo
-- **aborta** o rollback: apagá-lo aqui tiraria acesso de quem já entrou, e em silêncio. Quem quiser
-- reverter de verdade decide antes o que fazer com essas linhas.
BEGIN;

DO $$
DECLARE
  aggregate_memberships integer;
  aggregate_invitations integer;
BEGIN
  SELECT count(*) INTO aggregate_memberships FROM "membership_roles" WHERE "role" = 'aggregate';
  SELECT count(*) INTO aggregate_invitations FROM "user_invitation_roles" WHERE "role" = 'aggregate';

  IF aggregate_memberships > 0 OR aggregate_invitations > 0 THEN
    RAISE EXCEPTION
      'Cannot roll back the aggregate role: % membership rows and % invitation rows still hold it',
      aggregate_memberships, aggregate_invitations;
  END IF;
END
$$;

ALTER TABLE "membership_roles" DROP CONSTRAINT "membership_roles_role_check", ADD CONSTRAINT "membership_roles_role_check" CHECK ("role" in ('company-admin', 'finance', 'fiscal', 'operator', 'viewer', 'driver'));

ALTER TABLE "user_invitation_roles" DROP CONSTRAINT "user_invitation_roles_role_check", ADD CONSTRAINT "user_invitation_roles_role_check" CHECK ("role" in ('company-admin', 'finance', 'fiscal', 'operator', 'viewer', 'driver'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260821173515_identity_aggregate_role';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one identity_aggregate_role migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
