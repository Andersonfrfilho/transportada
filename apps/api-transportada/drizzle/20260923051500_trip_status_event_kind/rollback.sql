-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz a spec 171: a linha do tempo volta a não distinguir o nascimento da viagem de uma
-- transição, e `from_status <> to_status` volta a valer para toda linha.
--
-- O que se perde: as linhas `event_kind = 'created'` gravadas por `recordTripCreation` têm
-- `from_status = to_status` e o CHECK restaurado as recusaria — por isso elas são apagadas antes.
-- Depois do rollback a viagem deixa de ter o evento de criação na linha do tempo; nenhuma
-- transição real é perdida.

BEGIN;

DELETE FROM "trip_status_events" WHERE "event_kind" = 'created';

ALTER TABLE "trip_status_events" DROP CONSTRAINT "trip_status_events_transition_check";
ALTER TABLE "trip_status_events" ADD CONSTRAINT "trip_status_events_transition_check" CHECK ("from_status" <> "to_status");
ALTER TABLE "trip_status_events" DROP CONSTRAINT "trip_status_events_event_kind_check";
ALTER TABLE "trip_status_events" DROP COLUMN "event_kind";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260923051500_trip_status_event_kind';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_status_event_kind migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
