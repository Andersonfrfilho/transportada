CREATE TABLE "company_distribution_settings" (
	"company_id" uuid PRIMARY KEY,
	"scheduled_distribution_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nfe_imports" ADD COLUMN "triggered_by" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "nfe_imports" ADD COLUMN "automation_job" text;--> statement-breakpoint
ALTER TABLE "processing_outbox" ADD COLUMN "triggered_by" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "processing_outbox" ADD COLUMN "automation_job" text;--> statement-breakpoint
ALTER TABLE "company_distribution_settings" ADD CONSTRAINT "company_distribution_settings_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfe_imports" ADD CONSTRAINT "nfe_imports_origin_ck" CHECK (("triggered_by" = 'user' and "automation_job" is null) or ("triggered_by" = 'automation' and "automation_job" is not null));--> statement-breakpoint
ALTER TABLE "processing_outbox" ADD CONSTRAINT "processing_outbox_origin_ck" CHECK (("triggered_by" = 'user' and "automation_job" is null) or ("triggered_by" = 'automation' and "automation_job" is not null));