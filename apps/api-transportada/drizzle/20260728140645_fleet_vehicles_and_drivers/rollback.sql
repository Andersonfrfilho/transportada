-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverts the fleet registry: vehicles, drivers and the driver/vehicle assignment period.
-- Destructive: every vehicle, driver and assignment row is discarded. The composite membership
-- unique added for the tenant-safe driver link is dropped with them; the original
-- user_company_memberships uniqueness on (user_id, company_id) is untouched.
BEGIN;

DROP TABLE "fleet_driver_vehicle_assignments";

DROP TABLE "fleet_drivers";

DROP TABLE "fleet_vehicles";

ALTER TABLE "user_company_memberships"
  DROP CONSTRAINT "user_company_memberships_id_company_id_unique";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260728140645_fleet_vehicles_and_drivers'
      AND "hash" = 'f3c653be44591824badcbde0d45086a258da98372784399d2a970b562422f338';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one fleet_vehicles_and_drivers migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
