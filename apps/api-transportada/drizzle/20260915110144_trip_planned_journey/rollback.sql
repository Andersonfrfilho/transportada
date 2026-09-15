-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Remove a jornada congelada da viagem (spec 149 T6).
--
-- ⚠️ Viagem que já congelou a jornada (planejamento com roteiro) perde o número e a marca de
-- se a volta entrou — exporte antes em ambiente com uso real.
BEGIN;

ALTER TABLE "trips"
  DROP CONSTRAINT IF EXISTS "trips_planned_journey_seconds_check",
  DROP CONSTRAINT IF EXISTS "trips_planned_journey_check",
  DROP COLUMN IF EXISTS "planned_journey_includes_return",
  DROP COLUMN IF EXISTS "planned_journey_seconds";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260915110144_trip_planned_journey';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_planned_journey journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
