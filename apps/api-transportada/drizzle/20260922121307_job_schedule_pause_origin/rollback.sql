-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a origem da pausa (spec 161 T21, emenda): volta o CHECK ao formato solto que a migration
-- 20260922114949_job_schedule_pause_control deixou (pausa sem autor aceita, sem distinguir quem a
-- deixou frouxa) e apaga `paused_origin`. Reverter tira a garantia de que pausa humana tem dono —
-- só faça isso junto com o botão de ligar/desligar também revertido.
BEGIN;

ALTER TABLE "job_schedules" DROP CONSTRAINT "job_schedules_pause_check";
ALTER TABLE "job_schedules" DROP CONSTRAINT "job_schedules_paused_origin_check";

ALTER TABLE "job_schedules"
  ADD CONSTRAINT "job_schedules_pause_check"
  CHECK ("enabled" = ("paused_at" is null) and ("paused_by" is null or "paused_at" is not null));

ALTER TABLE "job_schedules" DROP COLUMN "paused_origin";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260922121307_job_schedule_pause_origin';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one job_schedule_pause_origin journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
