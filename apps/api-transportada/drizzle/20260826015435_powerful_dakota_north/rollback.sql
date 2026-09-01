-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverte a spec 058 (ADR-0044): as três tabelas do roteirizador e as seis colunas de coordenada em
-- trip_stops.
--
-- Perde-se a base de endereços geocodificados, que é o ativo mais caro de reconstruir desta feature
-- (ADR-0044 §3) — e reconstruí-la custa uma rodada de geocodificação paga. Exportar
-- geocoded_addresses antes é o passo que o runbook manda dar.
BEGIN;

DROP TABLE IF EXISTS "route_suggestion_stops";
DROP TABLE IF EXISTS "route_suggestions";
DROP TABLE IF EXISTS "company_route_optimization_settings";
DROP TABLE IF EXISTS "geocoded_addresses";

ALTER TABLE "trip_stops" DROP CONSTRAINT IF EXISTS "trip_stops_leg_check";
ALTER TABLE "trip_stops" DROP CONSTRAINT IF EXISTS "trip_stops_geocoding_precision_check";
ALTER TABLE "trip_stops" DROP CONSTRAINT IF EXISTS "trip_stops_longitude_range_check";
ALTER TABLE "trip_stops" DROP CONSTRAINT IF EXISTS "trip_stops_latitude_range_check";
ALTER TABLE "trip_stops" DROP CONSTRAINT IF EXISTS "trip_stops_coordinates_check";
ALTER TABLE "trip_stops" DROP COLUMN IF EXISTS "duration_from_previous_seconds";
ALTER TABLE "trip_stops" DROP COLUMN IF EXISTS "distance_from_previous_meters";
ALTER TABLE "trip_stops" DROP COLUMN IF EXISTS "estimated_arrival_at";
ALTER TABLE "trip_stops" DROP COLUMN IF EXISTS "geocoding_precision";
ALTER TABLE "trip_stops" DROP COLUMN IF EXISTS "longitude";
ALTER TABLE "trip_stops" DROP COLUMN IF EXISTS "latitude";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260826015435_powerful_dakota_north'
      AND "hash" = '992faeae162086fcbb312e5eb6652428411af6bf3ebceb8c65778c161edd6be0';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one powerful_dakota_north migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
