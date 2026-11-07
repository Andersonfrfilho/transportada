-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 299 T2.7: apaga os lembretes `idle`, a coluna `idle_minutes` e devolve a CHECK de `stage` sem `idle`.
-- Reverter só com a API também revertida — senão ela volta a gravar a etapa que a CHECK recusa.
BEGIN;

DELETE FROM "driver_stop_reminders" WHERE "stage" = 'idle';

ALTER TABLE "driver_stop_reminders" DROP CONSTRAINT "driver_stop_reminders_stage_check",
  ADD CONSTRAINT "driver_stop_reminders_stage_check" CHECK ("stage" in ('arrival', 'settlement'));
ALTER TABLE "company_driver_reminder_settings" DROP CONSTRAINT "company_driver_reminder_settings_idle_check";
ALTER TABLE "company_driver_reminder_settings" DROP COLUMN "idle_minutes";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261107144829_driver_stop_reminder_idle_stage';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one driver_stop_reminder_idle_stage journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
