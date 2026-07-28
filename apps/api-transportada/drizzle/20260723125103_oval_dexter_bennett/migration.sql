CREATE TABLE "billing_invoice_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"document_kind" text NOT NULL,
	"object_id" uuid NOT NULL,
	"sha256" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"document_version" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_invoice_documents_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "billing_invoice_documents_company_invoice_kind_version_unique" UNIQUE("company_id","invoice_id","document_kind","document_version"),
	CONSTRAINT "billing_invoice_documents_kind_check" CHECK ("document_kind" in ('pdf', 'csv', 'json')),
	CONSTRAINT "billing_invoice_documents_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "billing_invoice_documents_byte_size_check" CHECK ("byte_size" > 0),
	CONSTRAINT "billing_invoice_documents_version_check" CHECK ("document_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "billing_invoice_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"event_name" text NOT NULL,
	"event_version" bigint NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"reason" text,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_invoice_events_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "billing_invoice_events_name_check" CHECK ("event_name" in ('invoice_created', 'invoice_cancelled', 'document_generated', 'document_failed')),
	CONSTRAINT "billing_invoice_events_version_check" CHECK ("event_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "billing_invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"cte_document_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"batch_item_id" uuid NOT NULL,
	"line_number" bigint NOT NULL,
	"cte_access_key" text NOT NULL,
	"cte_number" bigint NOT NULL,
	"description" text NOT NULL,
	"freight_amount" numeric(14,2) NOT NULL,
	"total_amount" numeric(14,2) NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_invoice_items_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "billing_invoice_items_company_invoice_line_unique" UNIQUE("company_id","invoice_id","line_number"),
	CONSTRAINT "billing_invoice_items_company_cte_document_unique" UNIQUE("company_id","cte_document_id"),
	CONSTRAINT "billing_invoice_items_line_number_check" CHECK ("line_number" > 0),
	CONSTRAINT "billing_invoice_items_cte_access_key_check" CHECK ("cte_access_key" ~ '^[0-9]{44}$'),
	CONSTRAINT "billing_invoice_items_cte_number_check" CHECK ("cte_number" > 0),
	CONSTRAINT "billing_invoice_items_amounts_check" CHECK ("freight_amount" >= 0 and "total_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "billing_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"invoice_number" bigint NOT NULL,
	"status" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_document" text NOT NULL,
	"issue_date" timestamp with time zone NOT NULL,
	"due_date" timestamp with time zone NOT NULL,
	"currency" text NOT NULL,
	"subtotal_amount" numeric(14,2) NOT NULL,
	"discount_amount" numeric(14,2) NOT NULL,
	"surcharge_amount" numeric(14,2) NOT NULL,
	"total_amount" numeric(14,2) NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"correlation_id" text NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_invoices_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "billing_invoices_company_invoice_number_unique" UNIQUE("company_id","invoice_number"),
	CONSTRAINT "billing_invoices_company_idempotency_key_unique" UNIQUE("company_id","idempotency_key"),
	CONSTRAINT "billing_invoices_status_check" CHECK ("status" in ('issued', 'cancelled')),
	CONSTRAINT "billing_invoices_currency_check" CHECK ("currency" = 'BRL'),
	CONSTRAINT "billing_invoices_invoice_number_check" CHECK ("invoice_number" > 0),
	CONSTRAINT "billing_invoices_amounts_check" CHECK ("subtotal_amount" >= 0 and "discount_amount" >= 0 and "surcharge_amount" >= 0 and "total_amount" >= 0),
	CONSTRAINT "billing_invoices_total_check" CHECK ("total_amount" = ("subtotal_amount" - "discount_amount" + "surcharge_amount")),
	CONSTRAINT "billing_invoices_idempotency_key_check" CHECK (length("idempotency_key") > 0),
	CONSTRAINT "billing_invoices_request_fingerprint_check" CHECK (length("request_fingerprint") > 0),
	CONSTRAINT "billing_invoices_customer_document_check" CHECK ("customer_document" ~ '^[0-9]{11,14}$')
);
--> statement-breakpoint
CREATE INDEX "billing_invoice_documents_company_invoice_created_at_idx" ON "billing_invoice_documents" ("company_id","invoice_id","created_at");--> statement-breakpoint
CREATE INDEX "billing_invoice_events_company_invoice_occurred_at_idx" ON "billing_invoice_events" ("company_id","invoice_id","occurred_at");--> statement-breakpoint
CREATE INDEX "billing_invoice_items_company_invoice_line_idx" ON "billing_invoice_items" ("company_id","invoice_id","line_number");--> statement-breakpoint
CREATE INDEX "billing_invoices_company_status_due_date_idx" ON "billing_invoices" ("company_id","status","due_date");--> statement-breakpoint
CREATE INDEX "billing_invoices_company_customer_created_at_idx" ON "billing_invoices" ("company_id","customer_document","created_at");--> statement-breakpoint
ALTER TABLE "billing_invoice_documents" ADD CONSTRAINT "billing_invoice_documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "billing_invoice_documents" ADD CONSTRAINT "billing_invoice_documents_company_invoice_fk" FOREIGN KEY ("company_id","invoice_id") REFERENCES "billing_invoices"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "billing_invoice_documents" ADD CONSTRAINT "billing_invoice_documents_company_object_fk" FOREIGN KEY ("company_id","object_id") REFERENCES "stored_objects"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "billing_invoice_events" ADD CONSTRAINT "billing_invoice_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "billing_invoice_events" ADD CONSTRAINT "billing_invoice_events_company_invoice_fk" FOREIGN KEY ("company_id","invoice_id") REFERENCES "billing_invoices"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "billing_invoice_events" ADD CONSTRAINT "billing_invoice_events_actor_membership_fk" FOREIGN KEY ("actor_user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "billing_invoice_items" ADD CONSTRAINT "billing_invoice_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "billing_invoice_items" ADD CONSTRAINT "billing_invoice_items_company_invoice_fk" FOREIGN KEY ("company_id","invoice_id") REFERENCES "billing_invoices"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "billing_invoice_items" ADD CONSTRAINT "billing_invoice_items_company_cte_document_fk" FOREIGN KEY ("company_id","cte_document_id") REFERENCES "cte_fiscal_documents"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "billing_invoice_items" ADD CONSTRAINT "billing_invoice_items_company_batch_fk" FOREIGN KEY ("company_id","batch_id") REFERENCES "cte_batches"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "billing_invoice_items" ADD CONSTRAINT "billing_invoice_items_company_batch_item_fk" FOREIGN KEY ("company_id","batch_item_id") REFERENCES "cte_batch_items"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_actor_membership_fk" FOREIGN KEY ("actor_user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "stored_objects" DROP CONSTRAINT "stored_objects_purpose_check", ADD CONSTRAINT "stored_objects_purpose_check" CHECK ("purpose" in ('import_source', 'nfe_document', 'nfe_event', 'billing_document'));