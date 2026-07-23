CREATE TABLE "cte_batch_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"event_name" text NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cte_batch_events_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "cte_batch_events_name_check" CHECK ("event_name" in ('created', 'updated', 'submitted', 'in_flight', 'done', 'error', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "cte_batch_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"nfe_document_id" uuid NOT NULL,
	"freight_calculation_id" uuid NOT NULL,
	"calculation_snapshot" jsonb NOT NULL,
	"position" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cte_batch_items_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "cte_batch_items_company_id_batch_id_nfe_unique" UNIQUE("company_id","batch_id","nfe_document_id"),
	CONSTRAINT "cte_batch_items_position_check" CHECK ("position" > 0)
);
--> statement-breakpoint
CREATE TABLE "cte_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"operator_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"idempotency_key" text NOT NULL,
	"idempotency_fingerprint" text NOT NULL,
	"correlation_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cte_batches_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "cte_batches_company_id_name_unique" UNIQUE("company_id","name"),
	CONSTRAINT "cte_batches_company_id_idempotency_key_unique" UNIQUE("company_id","idempotency_key"),
	CONSTRAINT "cte_batches_status_check" CHECK ("status" in ('draft', 'submitted', 'in_flight', 'done', 'error', 'cancelled')),
	CONSTRAINT "cte_batches_version_check" CHECK ("version" > 0),
	CONSTRAINT "cte_batches_idempotency_key_check" CHECK ("idempotency_key" is not null and length("idempotency_key") > 0),
	CONSTRAINT "cte_batches_idempotency_fingerprint_check" CHECK ("idempotency_fingerprint" is not null and length("idempotency_fingerprint") > 0),
	CONSTRAINT "cte_batches_correlation_id_check" CHECK (length("correlation_id") > 0)
);
--> statement-breakpoint
CREATE TABLE "cte_submission_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"result" text,
	"submission_status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cte_submission_records_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "cte_submission_records_company_id_batch_id_idempotency_key_unique" UNIQUE("company_id","batch_id","idempotency_key"),
	CONSTRAINT "cte_submission_records_submission_status_check" CHECK ("submission_status" in ('pending', 'accepted', 'conflict', 'rejected')),
	CONSTRAINT "cte_submission_records_result_check" CHECK ("result" is null or "result" in ('ok', 'error'))
);
--> statement-breakpoint
CREATE INDEX "cte_batch_events_company_batch_occurred_at_idx" ON "cte_batch_events" ("company_id","batch_id","occurred_at");--> statement-breakpoint
CREATE INDEX "cte_batch_items_company_batch_created_at_idx" ON "cte_batch_items" ("company_id","batch_id","created_at");--> statement-breakpoint
CREATE INDEX "cte_batches_company_status_created_at_idx" ON "cte_batches" ("company_id","status","created_at");--> statement-breakpoint
ALTER TABLE "cte_batch_events" ADD CONSTRAINT "cte_batch_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cte_batch_events" ADD CONSTRAINT "cte_batch_events_company_batch_fk" FOREIGN KEY ("company_id","batch_id") REFERENCES "cte_batches"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cte_batch_items" ADD CONSTRAINT "cte_batch_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cte_batch_items" ADD CONSTRAINT "cte_batch_items_company_batch_fk" FOREIGN KEY ("company_id","batch_id") REFERENCES "cte_batches"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cte_batch_items" ADD CONSTRAINT "cte_batch_items_company_nfe_document_fk" FOREIGN KEY ("company_id","nfe_document_id") REFERENCES "nfe_documents"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cte_batch_items" ADD CONSTRAINT "cte_batch_items_company_freight_calculation_fk" FOREIGN KEY ("company_id","freight_calculation_id") REFERENCES "freight_calculations"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cte_batches" ADD CONSTRAINT "cte_batches_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cte_batches" ADD CONSTRAINT "cte_batches_operator_membership_fk" FOREIGN KEY ("operator_user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cte_submission_records" ADD CONSTRAINT "cte_submission_records_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cte_submission_records" ADD CONSTRAINT "cte_submission_records_company_batch_fk" FOREIGN KEY ("company_id","batch_id") REFERENCES "cte_batches"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;