ALTER TABLE "job_schedules" DROP CONSTRAINT "job_schedules_pause_check", ADD CONSTRAINT "job_schedules_pause_check" CHECK ("enabled" = ("paused_at" is null) and ("paused_by" is null or "paused_at" is not null));--> statement-breakpoint
UPDATE "job_schedules" SET "enabled" = false, "paused_at" = now(), "updated_at" = now() WHERE "job" = 'trip.occurrence-attachment.purge' AND "enabled" = true;
