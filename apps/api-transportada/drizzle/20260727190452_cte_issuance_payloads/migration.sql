CREATE TABLE "cte_issuance_payloads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"batch_item_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"provider_config" jsonb NOT NULL,
	"payload_sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cte_issuance_payloads_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "cte_issuance_payloads_company_attempt_unique" UNIQUE("company_id","attempt_id"),
	CONSTRAINT "cte_issuance_payloads_sha256_check" CHECK ("payload_sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE INDEX "cte_issuance_payloads_company_batch_item_created_at_idx" ON "cte_issuance_payloads" ("company_id","batch_item_id","created_at");--> statement-breakpoint
ALTER TABLE "cte_issuance_payloads" ADD CONSTRAINT "cte_issuance_payloads_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cte_issuance_payloads" ADD CONSTRAINT "cte_issuance_payloads_company_batch_fk" FOREIGN KEY ("company_id","batch_id") REFERENCES "cte_batches"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cte_issuance_payloads" ADD CONSTRAINT "cte_issuance_payloads_company_batch_item_fk" FOREIGN KEY ("company_id","batch_item_id") REFERENCES "cte_batch_items"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cte_issuance_payloads" ADD CONSTRAINT "cte_issuance_payloads_company_attempt_fk" FOREIGN KEY ("company_id","attempt_id") REFERENCES "cte_issuance_attempts"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;