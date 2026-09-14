-- Devolve o esquema anterior. O congelado é projeção sobre o catálogo do OSM no dia do
-- planejamento, não lançamento manual: reverter descarta a projeção, nunca um pagamento registrado.
DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260907210000_trip_planned_toll';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_planned_toll journal entry, removed %',
      deleted_migrations;
  END IF;
END $$;

ALTER TABLE "trips" DROP CONSTRAINT IF EXISTS "trips_planned_toll_check";
ALTER TABLE "trips" DROP COLUMN IF EXISTS "planned_toll_frozen_at";
ALTER TABLE "trips" DROP COLUMN IF EXISTS "planned_toll";
