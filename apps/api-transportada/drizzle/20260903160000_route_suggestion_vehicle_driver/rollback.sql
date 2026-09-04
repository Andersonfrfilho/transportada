-- Devolve a coluna ao estado anterior. O par escolhido se perde: a viagem ja criada guarda o
-- motorista em `trip_drivers`, mas a sugestao que ainda nao foi aceita volta a nao ter tripulacao.
DROP INDEX IF EXISTS "route_suggestion_vehicles_company_driver_idx";

ALTER TABLE "route_suggestion_vehicles"
	DROP CONSTRAINT IF EXISTS "route_suggestion_vehicles_suggestion_driver_unique";

ALTER TABLE "route_suggestion_vehicles"
	DROP CONSTRAINT IF EXISTS "route_suggestion_vehicles_driver_fk";

ALTER TABLE "route_suggestion_vehicles"
	DROP COLUMN IF EXISTS "driver_id";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260903160000_route_suggestion_vehicle_driver';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one route_suggestion_vehicle_driver journal entry, removed %',
      deleted_migrations;
  END IF;
END $$;
