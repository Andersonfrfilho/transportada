-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz o controle de pausa da spec 161 (T21): a rotina nasce desligada e o CHECK aceita pausa
-- de origem (paused_by nulo). Reverter religa a rotina de expurgo de foto de ocorrência — só faça
-- isso com o botão de ligar/desligar também revertido, senão a tela mente sobre o estado real.
BEGIN;

UPDATE "job_schedules"
  SET "enabled" = true, "paused_at" = null, "paused_by" = null, "updated_at" = now()
  WHERE "job" = 'trip.occurrence-attachment.purge' AND "paused_by" IS NULL;

ALTER TABLE "job_schedules" DROP CONSTRAINT "job_schedules_pause_check",
  ADD CONSTRAINT "job_schedules_pause_check"
  CHECK ("enabled" = ("paused_at" is null) and ("paused_at" is null) = ("paused_by" is null));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260922114949_job_schedule_pause_control';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one job_schedule_pause_control journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
