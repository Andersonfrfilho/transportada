CREATE TABLE "job_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"job" varchar(40) NOT NULL,
	"origin" varchar(10) NOT NULL,
	"company_id" uuid,
	"requested_by" uuid,
	"correlation_id" varchar(120) NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"outcome" varchar(40),
	"counters" jsonb DEFAULT '{}' NOT NULL,
	"lease_expires_at" timestamp with time zone,
	"cancel_requested_at" timestamp with time zone,
	CONSTRAINT "job_executions_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run')),
	CONSTRAINT "job_executions_origin_check" CHECK ("origin" in ('schedule', 'manual')),
	CONSTRAINT "job_executions_requester_check" CHECK (("origin" = 'manual') = ("requested_by" is not null) and ("requested_by" is null) = ("company_id" is null)),
	CONSTRAINT "job_executions_finish_check" CHECK (("finished_at" is null) = ("outcome" is null) and ("finished_at" is null or "finished_at" >= "started_at")),
	CONSTRAINT "job_executions_lease_check" CHECK ("finished_at" is null or "lease_expires_at" is null),
	CONSTRAINT "job_executions_correlation_id_check" CHECK (length("correlation_id") > 0)
);
--> statement-breakpoint
CREATE TABLE "job_schedules" (
	"job" varchar(40) PRIMARY KEY,
	"interval_seconds" integer NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"paused_at" timestamp with time zone,
	"paused_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_schedules_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run')),
	CONSTRAINT "job_schedules_interval_check" CHECK ("interval_seconds" >= 300),
	CONSTRAINT "job_schedules_pause_check" CHECK ("enabled" = ("paused_at" is null) and ("paused_at" is null) = ("paused_by" is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "job_executions_open_unique" ON "job_executions" ("job") WHERE "finished_at" is null;--> statement-breakpoint
CREATE INDEX "job_executions_job_started_at_idx" ON "job_executions" ("job","started_at");--> statement-breakpoint
ALTER TABLE "job_executions" ADD CONSTRAINT "job_executions_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "job_executions" ADD CONSTRAINT "job_executions_requester_membership_fk" FOREIGN KEY ("requested_by","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "job_schedules" ADD CONSTRAINT "job_schedules_paused_by_identity_users_id_fkey" FOREIGN KEY ("paused_by") REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
INSERT INTO "job_schedules" ("job", "interval_seconds", "next_run_at") VALUES
	('nfe.distribution.pull', 900, now()),
	('fuel.price.pull', 604800, now()),
	('nfse.status.pull', 300, now()),
	('notification.schedules.run', 3600, now());