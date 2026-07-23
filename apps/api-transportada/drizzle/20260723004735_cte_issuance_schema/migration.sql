CREATE TABLE "cte_fiscal_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"batch_item_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"access_key" text NOT NULL,
	"authorization_protocol" text NOT NULL,
	"fiscal_environment" text NOT NULL,
	"fiscal_series" text NOT NULL,
	"fiscal_number" bigint NOT NULL,
	"status" text NOT NULL,
	"xml_object_id" uuid NOT NULL,
	"xml_sha256" text NOT NULL,
	"authorized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cte_fiscal_documents_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "cte_fiscal_documents_company_access_key_unique" UNIQUE("company_id","access_key"),
	CONSTRAINT "cte_fiscal_documents_company_batch_item_unique" UNIQUE("company_id","batch_item_id"),
	CONSTRAINT "cte_fiscal_documents_access_key_check" CHECK ("access_key" ~ '^[0-9]{44}$'),
	CONSTRAINT "cte_fiscal_documents_status_check" CHECK ("status" in ('authorized', 'cancelled')),
	CONSTRAINT "cte_fiscal_documents_environment_check" CHECK ("fiscal_environment" in ('homologation', 'production')),
	CONSTRAINT "cte_fiscal_documents_sha256_check" CHECK ("xml_sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "cte_issuance_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"batch_item_id" uuid NOT NULL,
	"attempt_kind" text NOT NULL,
	"attempt_number" bigint NOT NULL,
	"status" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"idempotency_fingerprint" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"fiscal_environment" text NOT NULL,
	"fiscal_series" text NOT NULL,
	"fiscal_number" bigint NOT NULL,
	"reservation_id" uuid NOT NULL,
	"last_error_code" text,
	"last_error_cause" text,
	"correlation_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cte_issuance_attempts_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "cte_issuance_attempts_company_item_kind_fingerprint_unique" UNIQUE("company_id","batch_item_id","attempt_kind","request_fingerprint"),
	CONSTRAINT "cte_issuance_attempts_company_idempotency_key_unique" UNIQUE("company_id","idempotency_key"),
	CONSTRAINT "cte_issuance_attempts_status_check" CHECK ("status" in ('pending', 'in_flight', 'authorized', 'rejected', 'retry_scheduled', 'failed', 'reconciliation_required', 'cancelled')),
	CONSTRAINT "cte_issuance_attempts_kind_check" CHECK ("attempt_kind" in ('issue', 'reprocess', 'cancel')),
	CONSTRAINT "cte_issuance_attempts_attempt_number_check" CHECK ("attempt_number" > 0),
	CONSTRAINT "cte_issuance_attempts_environment_check" CHECK ("fiscal_environment" in ('homologation', 'production')),
	CONSTRAINT "cte_issuance_attempts_fiscal_number_check" CHECK ("fiscal_number" > 0),
	CONSTRAINT "cte_issuance_attempts_idempotency_key_check" CHECK (length("idempotency_key") > 0),
	CONSTRAINT "cte_issuance_attempts_request_fingerprint_check" CHECK (length("request_fingerprint") > 0)
);
--> statement-breakpoint
CREATE TABLE "cte_issuance_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"batch_item_id" uuid NOT NULL,
	"event_name" text NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cte_issuance_events_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "cte_issuance_events_name_check" CHECK ("event_name" in ('issue_requested', 'in_flight', 'authorized', 'rejected', 'failed', 'retry_scheduled', 'reconciliation_required', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "cte_retry_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"batch_item_id" uuid NOT NULL,
	"status" text NOT NULL,
	"attempt_count" bigint DEFAULT 0 NOT NULL,
	"max_attempts" bigint NOT NULL,
	"next_attempt_at" timestamp with time zone NOT NULL,
	"last_error_cause" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cte_retry_schedules_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "cte_retry_schedules_company_attempt_unique" UNIQUE("company_id","attempt_id"),
	CONSTRAINT "cte_retry_schedules_status_check" CHECK ("status" in ('scheduled', 'claimed', 'exhausted', 'cancelled')),
	CONSTRAINT "cte_retry_schedules_attempt_count_check" CHECK ("attempt_count" >= 0),
	CONSTRAINT "cte_retry_schedules_max_attempts_check" CHECK ("max_attempts" > 0)
);
--> statement-breakpoint
ALTER TABLE "fiscal_sequence_reservations" ADD CONSTRAINT "fiscal_sequence_reservations_company_id_id_unique" UNIQUE("company_id","id");--> statement-breakpoint
CREATE INDEX "cte_issuance_attempts_company_status_created_at_idx" ON "cte_issuance_attempts" ("company_id","status","created_at");--> statement-breakpoint
CREATE INDEX "cte_issuance_events_company_batch_item_created_at_idx" ON "cte_issuance_events" ("company_id","batch_item_id","created_at");--> statement-breakpoint
CREATE INDEX "cte_retry_schedules_company_status_next_attempt_idx" ON "cte_retry_schedules" ("company_id","status","next_attempt_at");--> statement-breakpoint
ALTER TABLE "cte_fiscal_documents" ADD CONSTRAINT "cte_fiscal_documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cte_fiscal_documents" ADD CONSTRAINT "cte_fiscal_documents_company_batch_item_fk" FOREIGN KEY ("company_id","batch_item_id") REFERENCES "cte_batch_items"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cte_fiscal_documents" ADD CONSTRAINT "cte_fiscal_documents_company_attempt_fk" FOREIGN KEY ("company_id","attempt_id") REFERENCES "cte_issuance_attempts"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cte_fiscal_documents" ADD CONSTRAINT "cte_fiscal_documents_company_xml_object_fk" FOREIGN KEY ("company_id","xml_object_id") REFERENCES "stored_objects"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cte_issuance_attempts" ADD CONSTRAINT "cte_issuance_attempts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cte_issuance_attempts" ADD CONSTRAINT "cte_issuance_attempts_company_batch_fk" FOREIGN KEY ("company_id","batch_id") REFERENCES "cte_batches"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cte_issuance_attempts" ADD CONSTRAINT "cte_issuance_attempts_company_batch_item_fk" FOREIGN KEY ("company_id","batch_item_id") REFERENCES "cte_batch_items"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cte_issuance_attempts" ADD CONSTRAINT "cte_issuance_attempts_company_reservation_fk" FOREIGN KEY ("company_id","reservation_id") REFERENCES "fiscal_sequence_reservations"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cte_issuance_events" ADD CONSTRAINT "cte_issuance_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cte_issuance_events" ADD CONSTRAINT "cte_issuance_events_company_attempt_fk" FOREIGN KEY ("company_id","attempt_id") REFERENCES "cte_issuance_attempts"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cte_issuance_events" ADD CONSTRAINT "cte_issuance_events_company_batch_item_fk" FOREIGN KEY ("company_id","batch_item_id") REFERENCES "cte_batch_items"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cte_retry_schedules" ADD CONSTRAINT "cte_retry_schedules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cte_retry_schedules" ADD CONSTRAINT "cte_retry_schedules_company_attempt_fk" FOREIGN KEY ("company_id","attempt_id") REFERENCES "cte_issuance_attempts"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cte_retry_schedules" ADD CONSTRAINT "cte_retry_schedules_company_batch_item_fk" FOREIGN KEY ("company_id","batch_item_id") REFERENCES "cte_batch_items"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;