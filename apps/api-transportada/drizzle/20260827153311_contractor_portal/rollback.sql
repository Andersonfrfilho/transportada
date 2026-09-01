-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverte a spec 063 T002: o vinculo do contratante com o documento, o rastro de posicao da viagem
-- e o consentimento do motorista.
--
-- E **quebra** se alguma conta ja estiver com o papel `contractor`: apagar o vinculo em silencio
-- deixaria a conta viva sem nada que a recorte — um contratante autenticado sem documento amarrado.
-- Decida o papel dessas contas antes de reverter.
BEGIN;

DO $$
DECLARE
  affected integer;
BEGIN
  SELECT count(*) INTO affected FROM "membership_roles" WHERE "role" = 'contractor';
  IF affected > 0 THEN
    RAISE EXCEPTION 'Contractor memberships still assigned: %. Decide their role before rolling back.', affected;
  END IF;
END
$$;

ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "location_sharing_consent_at";

DROP TABLE IF EXISTS "trip_location_pings";
DROP TABLE IF EXISTS "contractor_portal_bindings";

ALTER TABLE "user_invitation_roles" DROP CONSTRAINT IF EXISTS "user_invitation_roles_role_check";
ALTER TABLE "user_invitation_roles" ADD CONSTRAINT "user_invitation_roles_role_check"
  CHECK ("role" in ('company-admin', 'finance', 'fiscal', 'operator', 'viewer', 'driver', 'aggregate', 'separator'));

ALTER TABLE "membership_roles" DROP CONSTRAINT IF EXISTS "membership_roles_role_check";
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_role_check"
  CHECK ("role" in ('company-admin', 'finance', 'fiscal', 'operator', 'viewer', 'driver', 'aggregate', 'separator', 'automation'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260827153311_contractor_portal'
      AND "hash" = '900b330a7699444c3258cece128f17ffb98de5dd520a0a5f2cb0a6d92e751ad1';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one contractor_portal migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
