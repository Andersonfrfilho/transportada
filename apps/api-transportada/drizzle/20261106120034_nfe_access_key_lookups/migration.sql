CREATE TABLE "nfe_access_key_lookup_budgets" (
	"company_id" uuid,
	"environment" text,
	"window_started_at" timestamp with time zone NOT NULL,
	"used_in_window" integer DEFAULT 0 NOT NULL,
	"blocked_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nfe_access_key_lookup_budgets_company_environment_pk" PRIMARY KEY("company_id","environment"),
	CONSTRAINT "nfe_access_key_lookup_budgets_environment_check" CHECK ("environment" in ('homologation', 'production')),
	CONSTRAINT "nfe_access_key_lookup_budgets_used_check" CHECK ("used_in_window" >= 0)
);
--> statement-breakpoint
CREATE TABLE "nfe_access_key_lookups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"environment" text NOT NULL,
	"access_key" text NOT NULL,
	"status" text NOT NULL,
	"reason" text,
	"c_stat" text,
	"not_before" timestamp with time zone,
	"document_id" uuid,
	"import_id" uuid,
	"requested_by_user_id" uuid NOT NULL,
	"correlation_id" text NOT NULL,
	"attempts" bigint DEFAULT 0 NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nfe_access_key_lookups_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "nfe_access_key_lookups_environment_check" CHECK ("environment" in ('homologation', 'production')),
	CONSTRAINT "nfe_access_key_lookups_access_key_check" CHECK ("access_key" ~ '^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$'),
	CONSTRAINT "nfe_access_key_lookups_status_check" CHECK ("status" in ('queued', 'querying', 'waiting', 'imported', 'refused', 'failed')),
	CONSTRAINT "nfe_access_key_lookups_reason_check" CHECK ("reason" is null or "reason" in ('not_interested', 'summary_only', 'not_found', 'expired', 'cancelled', 'denied', 'certificate_mismatch', 'invalid_key', 'sefaz_unavailable')),
	CONSTRAINT "nfe_access_key_lookups_imported_document_check" CHECK (("status" <> 'imported') or ("document_id" is not null)),
	CONSTRAINT "nfe_access_key_lookups_refused_reason_check" CHECK (("status" <> 'refused') or ("reason" is not null)),
	CONSTRAINT "nfe_access_key_lookups_waiting_not_before_check" CHECK (("status" <> 'waiting') or ("not_before" is not null)),
	CONSTRAINT "nfe_access_key_lookups_attempts_check" CHECK ("attempts" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "nfe_access_key_lookups_active_unique" ON "nfe_access_key_lookups" ("company_id","environment","access_key") WHERE "status" in ('queued', 'querying', 'waiting');--> statement-breakpoint
CREATE INDEX "nfe_access_key_lookups_refusal_window_idx" ON "nfe_access_key_lookups" ("company_id","environment","access_key","finished_at" DESC);--> statement-breakpoint
CREATE INDEX "nfe_access_key_lookups_waiting_not_before_idx" ON "nfe_access_key_lookups" ("status","not_before") WHERE "status" = 'waiting';--> statement-breakpoint
ALTER TABLE "nfe_access_key_lookup_budgets" ADD CONSTRAINT "nfe_access_key_lookup_budgets_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfe_access_key_lookups" ADD CONSTRAINT "nfe_access_key_lookups_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfe_access_key_lookups" ADD CONSTRAINT "nfe_access_key_lookups_company_document_fk" FOREIGN KEY ("company_id","document_id") REFERENCES "nfe_documents"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfe_access_key_lookups" ADD CONSTRAINT "nfe_access_key_lookups_company_import_fk" FOREIGN KEY ("company_id","import_id") REFERENCES "nfe_imports"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfe_access_key_lookups" ADD CONSTRAINT "nfe_access_key_lookups_requested_by_membership_fk" FOREIGN KEY ("requested_by_user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfe_documents" DROP CONSTRAINT "nfe_documents_source_check", ADD CONSTRAINT "nfe_documents_source_check" CHECK ("source" in ('upload', 'distribution', 'access_key'));--> statement-breakpoint
ALTER TABLE "nfe_imports" DROP CONSTRAINT "nfe_imports_source_check", ADD CONSTRAINT "nfe_imports_source_check" CHECK ("source" in ('upload', 'distribution', 'access_key'));--> statement-breakpoint
ALTER TABLE "processing_outbox" DROP CONSTRAINT "processing_outbox_event_type_check", ADD CONSTRAINT "processing_outbox_event_type_check" CHECK ("event_type" in ('transportada.nfe.import.requested', 'transportada.nfe.distribution.requested', 'transportada.nfe.access-key.requested'));