-- ⚠️ Devolve o esquema e **não** os valores: o ETA das paradas continua gravado em `trip_stops`, e
-- sem este carimbo ele volta a ser uma hora sem idade — que é pior que hora nenhuma.
DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260909180000_trip_estimated_arrival_frozen';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_estimated_arrival_frozen journal entry, removed %',
      deleted_migrations;
  END IF;
END $$;

ALTER TABLE "trips" DROP COLUMN IF EXISTS "estimated_arrival_frozen_at";
