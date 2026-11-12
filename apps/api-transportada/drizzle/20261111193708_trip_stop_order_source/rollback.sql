-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 323 T4: tira da viagem a origem da ordem das paradas e o código da falha do ordenador. A ordem das
-- paradas em si (`trip_stops.sequence`) não muda; só se perde o registro de quem a decidiu.
--
-- ⚠️ Reverter só com a API também revertida — senão ela escreve e lê colunas que não existem.
BEGIN;

SET LOCAL lock_timeout = '3s';

ALTER TABLE "trips" DROP CONSTRAINT IF EXISTS "trips_stop_order_error_code_check";
ALTER TABLE "trips" DROP CONSTRAINT IF EXISTS "trips_stop_order_source_check";
ALTER TABLE "trips" DROP COLUMN IF EXISTS "stop_order_error_code";
ALTER TABLE "trips" DROP COLUMN IF EXISTS "stop_order_source";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261111193708_trip_stop_order_source';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_stop_order_source journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
