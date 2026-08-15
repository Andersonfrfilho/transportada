-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Restores the free-text vehicle color check on fleet_vehicles.
-- A cor fora da lista do Denatran foi zerada pela migration e não volta: o CRLV é a fonte para recadastrar.
BEGIN;

ALTER TABLE "fleet_vehicles" DROP CONSTRAINT "fleet_vehicles_color_check",
  ADD CONSTRAINT "fleet_vehicles_color_check" CHECK (length("color") <= 30);

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260814211033_fleet_vehicle_color_list'
      AND "hash" = 'ee66554247cd355a089666d60e7ba6bbc51c87bb22f0c08956bbb1d7c11942e9';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one fleet_vehicle_color_list migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
