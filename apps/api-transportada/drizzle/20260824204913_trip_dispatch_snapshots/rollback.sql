-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Remove trip_dispatch_snapshots e devolve trip_document_events à condição de append-only só por
-- convenção de código (o trigger sai junto, porque nasceu nesta migration).
-- Recusa rodar se qualquer viagem já foi despachada: o snapshot é o roteiro que o motorista levou,
-- e apagá-lo é perder a única prova do que se cobra dele depois (ADR-0043 §2).
-- Para prosseguir, decida o que fazer com a história primeiro:
-- select trip_id, dispatched_at, forced from trip_dispatch_snapshots order by dispatched_at;
BEGIN;

DO $$
DECLARE
  frozen_routes integer;
BEGIN
  SELECT count(*) INTO frozen_routes FROM "trip_dispatch_snapshots";

  IF frozen_routes > 0 THEN
    RAISE EXCEPTION 'Refusing to roll back: % dispatched trip(s) would lose the route the driver carried',
      frozen_routes;
  END IF;
END
$$;

DROP TRIGGER "trip_document_events_append_only_trigger" ON "trip_document_events";
DROP FUNCTION "reject_trip_document_events_mutation"();

DROP TRIGGER "trip_dispatch_snapshots_append_only_trigger" ON "trip_dispatch_snapshots";
DROP FUNCTION "reject_trip_dispatch_snapshots_mutation"();

DROP TABLE "trip_dispatch_snapshots";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260824204913_trip_dispatch_snapshots'
      AND "hash" = '7141c62c2e6ed81dbbd03db2bf20dd49d8e9996e51df3f5f101278377c83abeb';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_dispatch_snapshots migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
