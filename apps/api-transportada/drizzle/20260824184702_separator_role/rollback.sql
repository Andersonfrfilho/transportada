-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Estreita os dois CHECKs de papel de volta aos sete nomes anteriores, tirando 'separator' — o
-- papel do separador que monta a viagem do celular.
-- Recusa rodar enquanto existir vínculo ou convite com esse papel: estreitar o CHECK falharia com
-- erro do Postgres, e apagar a linha para caber tiraria o acesso de alguém sem ninguém decidir.
-- Para prosseguir, decida o que fazer com esses vínculos primeiro:
-- select membership_id from membership_roles where role = 'separator';
-- select invitation_id from user_invitation_roles where role = 'separator';
BEGIN;

DO $$
DECLARE
  separator_memberships integer;
  separator_invitations integer;
BEGIN
  SELECT count(*) INTO separator_memberships
    FROM "membership_roles" WHERE "role" = 'separator';

  SELECT count(*) INTO separator_invitations
    FROM "user_invitation_roles" WHERE "role" = 'separator';

  IF separator_memberships > 0 OR separator_invitations > 0 THEN
    RAISE EXCEPTION 'Refusing to roll back the separator role: % membership(s) and % invitation(s) would no longer fit the check',
      separator_memberships, separator_invitations;
  END IF;
END
$$;

ALTER TABLE "membership_roles"
  DROP CONSTRAINT "membership_roles_role_check",
  ADD CONSTRAINT "membership_roles_role_check" CHECK ("role" in ('company-admin', 'finance', 'fiscal', 'operator', 'viewer', 'driver', 'aggregate'));--> statement-breakpoint
ALTER TABLE "user_invitation_roles"
  DROP CONSTRAINT "user_invitation_roles_role_check",
  ADD CONSTRAINT "user_invitation_roles_role_check" CHECK ("role" in ('company-admin', 'finance', 'fiscal', 'operator', 'viewer', 'driver', 'aggregate'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260824184702_separator_role'
      AND "hash" = '0cc6be8ea30db92a31a50ff3ca8a80184cca183d28f62e21990c1d7e54ef5030';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one separator role migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
