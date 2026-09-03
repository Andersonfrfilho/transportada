-- Devolve a tabela ao estado anterior. A distancia aferida se perde: ela nao tem outro lugar onde
-- viva, e o relato em si continua na linha.
ALTER TABLE "trip_stop_occurrences"
	DROP CONSTRAINT IF EXISTS "trip_stop_occurrences_distance_check";

ALTER TABLE "trip_stop_occurrences"
	DROP COLUMN IF EXISTS "reported_distance_meters";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260903200000_stop_occurrence_distance';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one stop_occurrence_distance journal entry, removed %',
      deleted_migrations;
  END IF;
END $$;
