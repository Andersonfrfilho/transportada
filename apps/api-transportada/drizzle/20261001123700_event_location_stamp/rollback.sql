-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 196 D2: tira o estado do ponto do evento de parada e do comprovante de entrega.
-- O que se perde é a distinção entre "o GPS falhou", "o prazo apagou" e "não se aplica" — a
-- coordenada em si não é tocada, e o backfill de `captured` é reconstituível a partir dela.
BEGIN;

ALTER TABLE "trip_stop_events"
  DROP CONSTRAINT IF EXISTS "trip_stop_events_location_state_check",
  DROP CONSTRAINT IF EXISTS "trip_stop_events_location_state_consistency_check";

ALTER TABLE "trip_delivery_proofs"
  DROP CONSTRAINT IF EXISTS "trip_delivery_proofs_location_state_check",
  DROP CONSTRAINT IF EXISTS "trip_delivery_proofs_location_state_consistency_check";

ALTER TABLE "trip_stop_events"
  DROP COLUMN IF EXISTS "location_state";

ALTER TABLE "trip_delivery_proofs"
  DROP COLUMN IF EXISTS "location_state";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261001123700_event_location_stamp';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one event_location_stamp journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
