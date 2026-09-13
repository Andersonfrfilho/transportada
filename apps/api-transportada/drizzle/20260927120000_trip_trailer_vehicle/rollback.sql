-- Devolve o esquema, nunca os valores: cavalo com carreta padrão declarada e viagem com carreta
-- vinculada perdem o vínculo, e ninguém redescobre isso sozinho depois.
DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260927120000_trip_trailer_vehicle';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_trailer_vehicle journal entry, removed %',
      deleted_migrations;
  END IF;
END $$;

DROP INDEX IF EXISTS "trips_company_trailer_open_unique";

ALTER TABLE "trips" DROP CONSTRAINT IF EXISTS "trips_trailer_not_vehicle";
ALTER TABLE "fleet_vehicles" DROP CONSTRAINT IF EXISTS "fleet_vehicles_default_trailer_not_self";
ALTER TABLE "fleet_vehicles" DROP CONSTRAINT IF EXISTS "fleet_vehicles_default_trailer_tractor_only";

ALTER TABLE "trips" DROP CONSTRAINT IF EXISTS "trips_company_trailer_vehicle_fk";
ALTER TABLE "fleet_vehicles" DROP CONSTRAINT IF EXISTS "fleet_vehicles_company_default_trailer_fk";

ALTER TABLE "trips" DROP COLUMN IF EXISTS "trailer_vehicle_id";
ALTER TABLE "fleet_vehicles" DROP COLUMN IF EXISTS "default_trailer_vehicle_id";
