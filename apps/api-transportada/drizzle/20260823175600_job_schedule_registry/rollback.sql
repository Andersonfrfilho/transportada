-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Derruba o relógio das rotinas e o histórico de execução dele.
-- A execução sai antes do agendamento: ela é que nomeia a rotina, ainda que por valor.
BEGIN;

DROP TABLE IF EXISTS "job_executions";

DROP TABLE IF EXISTS "job_schedules";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260823175600_job_schedule_registry'
      AND "hash" = 'cc2dfafbca08fd422510b33a19e3ca4a7a32eeb3efa121f43e7de09afde99ea8';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one job_schedule_registry migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
