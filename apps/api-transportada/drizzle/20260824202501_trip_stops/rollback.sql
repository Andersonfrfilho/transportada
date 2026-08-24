-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Remove trip_stops inteira. Recusa rodar se qualquer parada já registrou chegada ou conclusão —
-- isso é operação real acontecendo, e apagar a tabela apagaria o rastro dela sem ninguém decidir.
BEGIN;

DO $$
DECLARE
  visited_stops integer;
BEGIN
  SELECT count(*) INTO visited_stops
    FROM "trip_stops"
    WHERE "arrived_at" IS NOT NULL OR "completed_at" IS NOT NULL;

  IF visited_stops > 0 THEN
    RAISE EXCEPTION 'Refusing to roll back: % trip_stop(s) already recorded arrival or completion',
      visited_stops;
  END IF;
END
$$;

DROP TABLE "trip_stops";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260824202501_trip_stops'
      AND "hash" = '87878ec2ec6055bd94ed09f01c07003da75c7b8c6ddf13ca71ec9b39772a5a43';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_stops migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
