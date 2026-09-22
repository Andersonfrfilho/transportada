-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 153 RF1 (rota escolhida congelada na viagem). `planned_toll`/`planned_toll_frozen_at`
-- (spec 090 T11) não são tocados: continuam existindo antes e depois deste rollback.
BEGIN;

ALTER TABLE "trips" DROP CONSTRAINT IF EXISTS "trips_planned_route_metrics_check";
ALTER TABLE "trips" DROP CONSTRAINT IF EXISTS "trips_planned_route_check";
ALTER TABLE "trips" DROP COLUMN IF EXISTS "planned_route";
ALTER TABLE "trips" DROP COLUMN IF EXISTS "planned_distance_meters";
ALTER TABLE "trips" DROP COLUMN IF EXISTS "planned_return_distance_meters";
ALTER TABLE "trips" DROP COLUMN IF EXISTS "planned_duration_seconds";
ALTER TABLE "trips" DROP COLUMN IF EXISTS "planned_route_frozen_at";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260916174951_trip_planned_route'
      AND "hash" = '79a86058066bfa496e1c12b8a2ea6e42f66110b3919c6b86fbebae502ef2f087';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_planned_route migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
