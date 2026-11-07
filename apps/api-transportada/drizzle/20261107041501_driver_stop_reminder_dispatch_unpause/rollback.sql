-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 299 T2.4: devolve a rotina `driver.stop-reminder.dispatch` à pausa do sistema. Reverter só com o worker
-- também revertido — senão a batida abre uma janela que cai em `job_run_routine_missing`.
BEGIN;

UPDATE "job_schedules"
  SET "enabled" = false, "paused_at" = now(), "paused_by" = NULL, "paused_origin" = 'system'
  WHERE "job" = 'driver.stop-reminder.dispatch' AND "enabled" = true;

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261107041501_driver_stop_reminder_dispatch_unpause';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one driver_stop_reminder_dispatch_unpause journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
