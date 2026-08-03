-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverts the driver/vehicle link back to one live vehicle per driver.
-- Destructive: the old exclusive indexes only rebuild after releasing the extra live links,
-- so every duplicated pair kept by the N:N model is closed with released_at.
BEGIN;

UPDATE "fleet_driver_vehicle_assignments" AS "extra"
  SET "released_at" = now(), "updated_at" = now()
  WHERE "extra"."released_at" IS NULL
    AND EXISTS (
      SELECT 1
        FROM "fleet_driver_vehicle_assignments" AS "kept"
        WHERE "kept"."released_at" IS NULL
          AND "kept"."company_id" = "extra"."company_id"
          AND ("kept"."driver_id" = "extra"."driver_id" OR "kept"."vehicle_id" = "extra"."vehicle_id")
          AND ("kept"."assigned_at", "kept"."id") < ("extra"."assigned_at", "extra"."id")
    );

DROP INDEX IF EXISTS "fleet_driver_vehicle_assignments_company_vehicle_idx";

DROP INDEX IF EXISTS "fleet_driver_vehicle_assignments_live_link_unique";

CREATE UNIQUE INDEX "fleet_driver_vehicle_assignments_live_vehicle_unique"
  ON "fleet_driver_vehicle_assignments" ("company_id","vehicle_id")
  WHERE "released_at" is null;

CREATE UNIQUE INDEX "fleet_driver_vehicle_assignments_live_driver_unique"
  ON "fleet_driver_vehicle_assignments" ("company_id","driver_id")
  WHERE "released_at" is null;

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260803000529_fleet_driver_vehicle_link'
      AND "hash" = '3de4ffd8c71717b59314d0624764f095283bd5be997a1e041975a0b26029f93e';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one fleet_driver_vehicle_link migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
