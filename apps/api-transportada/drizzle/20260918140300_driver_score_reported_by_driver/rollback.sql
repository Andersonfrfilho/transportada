-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 157 T11 (item 14): o motorista que reportou gravado no evento de campo. Sem a
-- coluna, a nota do motorista volta a resolver o autor só pelo vínculo atual (membership).
BEGIN;

ALTER TABLE "trip_stop_events" DROP CONSTRAINT "trip_stop_events_company_reported_by_driver_fk";
ALTER TABLE "trip_stop_events" DROP COLUMN "reported_by_driver_id";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260918140300_driver_score_reported_by_driver';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one driver_score_reported_by_driver journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
