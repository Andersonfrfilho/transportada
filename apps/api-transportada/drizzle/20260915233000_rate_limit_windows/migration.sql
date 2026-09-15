CREATE TABLE "rate_limit_windows" (
	"scope" varchar(60),
	"subject_key" varchar(120),
	"window_start" timestamp with time zone,
	"hits" integer NOT NULL,
	CONSTRAINT "rate_limit_windows_pkey" PRIMARY KEY("scope","subject_key","window_start")
);
--> statement-breakpoint
CREATE INDEX "rate_limit_windows_window_start_idx" ON "rate_limit_windows" ("window_start");--> statement-breakpoint
ALTER TABLE "job_executions" DROP CONSTRAINT "job_executions_job_check", ADD CONSTRAINT "job_executions_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine', 'whatsapp.command.settle', 'trip.cargo-layout.purge', 'rate-limit.window.purge'));--> statement-breakpoint
ALTER TABLE "job_schedules" DROP CONSTRAINT "job_schedules_job_check", ADD CONSTRAINT "job_schedules_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine', 'whatsapp.command.settle', 'trip.cargo-layout.purge', 'rate-limit.window.purge'));--> statement-breakpoint
INSERT INTO "job_schedules" ("job", "interval_seconds", "next_run_at") VALUES
	('rate-limit.window.purge', 3600, now());