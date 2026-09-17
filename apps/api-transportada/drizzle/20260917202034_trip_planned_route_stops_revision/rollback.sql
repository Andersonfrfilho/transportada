-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Remove o trigger, a função e a coluna de revisão do conjunto de paradas (spec 153 T802).
--
-- Só contador: nenhum dado de negócio se perde. Sem ele o compare-and-set do congelamento volta a
-- comparar `updated_at` (o comportamento anterior a esta migration).
BEGIN;

DROP TRIGGER "trip_stops_bump_planned_route_revision_trigger" ON "trip_stops";
DROP FUNCTION "bump_trip_planned_route_stops_revision"();

ALTER TABLE "trips" DROP COLUMN "planned_route_stops_revision";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260917202034_trip_planned_route_stops_revision';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_planned_route_stops_revision journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
