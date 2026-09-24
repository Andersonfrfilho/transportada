ALTER TABLE "job_schedules" ADD COLUMN "paused_origin" varchar(6);--> statement-breakpoint
UPDATE "job_schedules" SET "paused_origin" = 'system', "updated_at" = now()
  WHERE "enabled" = false AND "paused_by" IS NULL;--> statement-breakpoint
UPDATE "job_schedules" SET "paused_origin" = 'user', "updated_at" = now()
  WHERE "enabled" = false AND "paused_by" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "job_schedules" ADD CONSTRAINT "job_schedules_paused_origin_check" CHECK ("paused_origin" in ('system', 'user'));--> statement-breakpoint
ALTER TABLE "job_schedules" DROP CONSTRAINT "job_schedules_pause_check", ADD CONSTRAINT "job_schedules_pause_check" CHECK ((
        "enabled" = true
        and "paused_at" is null and "paused_by" is null
        and "paused_origin" is null
      ) or (
        "enabled" = false
        and "paused_at" is not null and "paused_origin" is not null
        and (
          ("paused_origin" = 'user' and "paused_by" is not null) or
          ("paused_origin" = 'system' and "paused_by" is null)
        )
      ));
