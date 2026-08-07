-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverts the RNTRC registry to eight positions: drops the fiscal profile check and narrows the
-- vehicle owner check back to '^[0-9]{8}$'.
-- Refuses to run while any row holds the nine-position value the ANTT certificate prints, because
-- narrowing the check would either fail cryptically or force silently rewriting fiscal cadastre.
-- Fix the data first: export company_fiscal_profiles (company_id, rntrc) and fleet_vehicles
-- (id, owner_rntrc), then decide per row whether the leading zero is dropped.
BEGIN;

DO $$
DECLARE
  nine_position_profiles integer;
  nine_position_vehicles integer;
BEGIN
  SELECT count(*) INTO nine_position_profiles
    FROM "company_fiscal_profiles" WHERE length("rntrc") = 9;

  SELECT count(*) INTO nine_position_vehicles
    FROM "fleet_vehicles" WHERE length("owner_rntrc") = 9;

  IF nine_position_profiles > 0 OR nine_position_vehicles > 0 THEN
    RAISE EXCEPTION 'Refusing to roll back the RNTRC registry: % fiscal profiles and % vehicles still hold the nine-position value',
      nine_position_profiles, nine_position_vehicles;
  END IF;
END
$$;

ALTER TABLE "fleet_vehicles"
  DROP CONSTRAINT "fleet_vehicles_owner_rntrc_check",
  ADD CONSTRAINT "fleet_vehicles_owner_rntrc_check" CHECK (length("owner_rntrc") = 0 or "owner_rntrc" ~ '^[0-9]{8}$');

ALTER TABLE "company_fiscal_profiles"
  DROP CONSTRAINT "company_fiscal_profiles_rntrc_check";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260807223440_rntrc_registry_leading_zero'
      AND "hash" = '4b1aafc75416330fb1425ee96e1662fdabd55cdcc5affff76aa891e3cd97684d';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one rntrc_registry_leading_zero migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
