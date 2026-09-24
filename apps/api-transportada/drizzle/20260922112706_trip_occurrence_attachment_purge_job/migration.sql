CREATE INDEX "stored_objects_purpose_retention_idx" ON "stored_objects" ("purpose","retention_until") WHERE "status" <> 'deleted' and "retention_until" is not null;--> statement-breakpoint
ALTER TABLE "job_executions" DROP CONSTRAINT "job_executions_job_check";--> statement-breakpoint
ALTER TABLE "job_executions" ADD CONSTRAINT "job_executions_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine', 'whatsapp.command.settle', 'trip.cargo-layout.purge', 'rate-limit.window.purge', 'trip.occurrence-attachment.purge')) NOT VALID;--> statement-breakpoint
ALTER TABLE "job_executions" VALIDATE CONSTRAINT "job_executions_job_check";--> statement-breakpoint
ALTER TABLE "job_schedules" DROP CONSTRAINT "job_schedules_job_check";--> statement-breakpoint
ALTER TABLE "job_schedules" ADD CONSTRAINT "job_schedules_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine', 'whatsapp.command.settle', 'trip.cargo-layout.purge', 'rate-limit.window.purge', 'trip.occurrence-attachment.purge')) NOT VALID;--> statement-breakpoint
ALTER TABLE "job_schedules" VALIDATE CONSTRAINT "job_schedules_job_check";--> statement-breakpoint
INSERT INTO "job_schedules" ("job", "interval_seconds", "next_run_at") VALUES
	('trip.occurrence-attachment.purge', 86400, now());
