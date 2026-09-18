-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 157 T7: o índice parcial que serve a nota do motorista (entregas dos últimos 90
-- dias por empresa). Só DDL de índice — nenhum dado depende dele.
BEGIN;

DROP INDEX IF EXISTS "trip_stop_events_company_delivered_at_idx";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260918140200_driver_score_delivered_index';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one driver_score_delivered_index journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
