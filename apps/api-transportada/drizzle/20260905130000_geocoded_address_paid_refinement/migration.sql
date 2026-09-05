ALTER TABLE "geocoded_addresses" ADD COLUMN "paid_refined_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "geocoded_addresses_pending_paid_refinement_idx" ON "geocoded_addresses" ("address_key") WHERE "precision" = 'city' AND "paid_refined_at" is null;--> statement-breakpoint
ALTER TABLE "job_executions" DROP CONSTRAINT "job_executions_job_check", ADD CONSTRAINT "job_executions_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine'));--> statement-breakpoint
ALTER TABLE "job_schedules" DROP CONSTRAINT "job_schedules_job_check", ADD CONSTRAINT "job_schedules_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine'));--> statement-breakpoint
INSERT INTO "job_schedules" ("job", "interval_seconds", "next_run_at") VALUES
	('geocoding.refine', 3600, now());
