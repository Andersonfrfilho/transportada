-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverte ADR-0042: volta trips.status para open/closed e remove o eixo separation_status de
-- trip_documents. Só é seguro enquanto nenhuma viagem visitou um estado que open/closed não
-- representa (route_planned, separating, loading, dispatched, in_transit) e nenhuma nota foi
-- separada/carregada/devolvida pelo fluxo novo — sinal de que a aplicação já rodou sobre o modelo
-- novo, e recuar perderia informação que não existia antes desta migration.
BEGIN;

DO $$
DECLARE
  trips_in_new_states integer;
  documents_in_new_states integer;
BEGIN
  SELECT count(*) INTO trips_in_new_states
    FROM "trips"
    WHERE "status" IN ('route_planned', 'separating', 'loading', 'dispatched', 'in_transit', 'cancelled');

  IF trips_in_new_states > 0 THEN
    RAISE EXCEPTION 'Refusing to roll back: % trip(s) are in a status that open/closed cannot represent',
      trips_in_new_states;
  END IF;

  SELECT count(*) INTO documents_in_new_states
    FROM "trip_documents"
    WHERE "separation_status" IN ('separated', 'loaded')
       OR ("separation_status" = 'returned' AND "return_reason" IS DISTINCT FROM 'migration');

  IF documents_in_new_states > 0 THEN
    RAISE EXCEPTION 'Refusing to roll back: % trip_document(s) carry separation state the old model cannot represent',
      documents_in_new_states;
  END IF;
END
$$;

ALTER TABLE "trip_documents" DROP CONSTRAINT "trip_documents_return_reason_check";
ALTER TABLE "trip_documents" DROP CONSTRAINT "trip_documents_separation_status_check";

ALTER TABLE "trips" DROP CONSTRAINT "trips_status_check";

UPDATE "trips"
SET "status" = CASE "status" WHEN 'draft' THEN 'open' WHEN 'completed' THEN 'closed' ELSE "status" END
WHERE "status" IN ('draft', 'completed');

ALTER TABLE "trips" ADD CONSTRAINT "trips_status_check" CHECK ("status" in ('open', 'closed'));

ALTER TABLE "trips" ALTER COLUMN "status" SET DEFAULT 'open';

ALTER TABLE "trip_documents" DROP COLUMN "return_reason";
ALTER TABLE "trip_documents" DROP COLUMN "returned_at";
ALTER TABLE "trip_documents" DROP COLUMN "loaded_at";
ALTER TABLE "trip_documents" DROP COLUMN "separated_at";
ALTER TABLE "trip_documents" DROP COLUMN "separation_status";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260824200157_trip_status_machine'
      AND "hash" = '0ec2ff0686381e31f70ac1e63543819e3b4ab3102dc15074f3dc57df7cbe74ed';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip status machine migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
