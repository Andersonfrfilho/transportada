CREATE TABLE "cte_issuance_diagnostics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"batch_item_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"attempt_kind" text NOT NULL,
	"event_id" uuid NOT NULL,
	"correlation_id" text,
	"phase" text NOT NULL,
	"request" jsonb,
	"response" jsonb,
	"error" jsonb,
	"duration_ms" integer,
	"occurred_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cte_issuance_diagnostics_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "cte_issuance_diagnostics_phase_check" CHECK ("phase" in ('request', 'response', 'error')),
	CONSTRAINT "cte_issuance_diagnostics_duration_check" CHECK ("duration_ms" >= 0)
);
--> statement-breakpoint
CREATE INDEX "cte_issuance_diagnostics_company_item_occurred_at_idx" ON "cte_issuance_diagnostics" ("company_id","batch_item_id","occurred_at");--> statement-breakpoint
CREATE INDEX "cte_issuance_diagnostics_company_attempt_idx" ON "cte_issuance_diagnostics" ("company_id","attempt_id");--> statement-breakpoint
CREATE INDEX "cte_issuance_diagnostics_expires_at_idx" ON "cte_issuance_diagnostics" ("expires_at");--> statement-breakpoint
ALTER TABLE "cte_issuance_diagnostics" ADD CONSTRAINT "cte_issuance_diagnostics_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;