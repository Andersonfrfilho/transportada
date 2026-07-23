CREATE TABLE "processing_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"module" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"status" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"last_error_code" text,
	"last_error_message" text,
	"correlation_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processing_jobs_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "processing_jobs_status_check" CHECK ("status" in ('pending', 'processing', 'succeeded', 'retry_scheduled', 'failed', 'dead_letter', 'cancelled')),
	CONSTRAINT "processing_jobs_attempt_count_check" CHECK ("attempt_count" >= 0),
	CONSTRAINT "processing_jobs_module_check" CHECK ("module" in ('nfe', 'freight', 'cte_batch', 'cte_issuance', 'billing')),
	CONSTRAINT "processing_jobs_safe_error_code_check" CHECK ("last_error_code" is null or length("last_error_code") between 1 and 80),
	CONSTRAINT "processing_jobs_safe_error_message_check" CHECK ("last_error_message" is null or length("last_error_message") <= 500)
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "permission" text DEFAULT 'legacy.audit' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "target_type" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "target_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "result" text DEFAULT 'allowed' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "metadata" jsonb DEFAULT '{}' NOT NULL;--> statement-breakpoint
CREATE INDEX "audit_logs_company_created_at_idx" ON "audit_logs" ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_company_target_idx" ON "audit_logs" ("company_id","target_type","target_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_company_correlation_idx" ON "audit_logs" ("company_id","correlation_id");--> statement-breakpoint
CREATE INDEX "processing_jobs_company_status_next_attempt_idx" ON "processing_jobs" ("company_id","status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "processing_jobs_company_module_entity_idx" ON "processing_jobs" ("company_id","module","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "processing_jobs_company_correlation_idx" ON "processing_jobs" ("company_id","correlation_id");--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_membership_fk" FOREIGN KEY ("actor_user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_result_check" CHECK ("result" in ('allowed', 'denied', 'failed'));--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_reason_check" CHECK ("reason" is null or length("reason") <= 500);--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_permission_check" CHECK (length("permission") between 1 and 120);--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_action_check" CHECK (length("action") between 1 and 160);