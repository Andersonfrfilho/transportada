CREATE TABLE "pickup_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"contractor_id" uuid,
	"source" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"requester_tax_id" text NOT NULL,
	"requester_name" text NOT NULL,
	"requester_email" text,
	"requester_phone" text,
	"origin" jsonb NOT NULL,
	"destination" jsonb NOT NULL,
	"window_start" date NOT NULL,
	"window_end" date NOT NULL,
	"cargo_description" text NOT NULL,
	"volumes" integer NOT NULL,
	"weight_kg" numeric(12,3) NOT NULL,
	"note" text,
	"quoted_total_amount" numeric(19,4),
	"quote_valid_until" date,
	"idempotency_key" text NOT NULL,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"accepted_window_start" date,
	"accepted_window_end" date,
	"accepted_total_amount" numeric(19,4),
	"trip_id" uuid,
	"trip_stop_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"stale_alerted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pickup_requests_kind_check" CHECK ("kind" in ('pickup', 'delivery')),
	CONSTRAINT "pickup_requests_status_check" CHECK ("status" in ('requested', 'accepted', 'refused', 'canceled', 'expired', 'scheduled', 'done')),
	CONSTRAINT "pickup_requests_source_check" CHECK ("source" in ('portal', 'public_quote', 'integration')),
	CONSTRAINT "pickup_requests_window_check" CHECK ("window_end" >= "window_start"),
	CONSTRAINT "pickup_requests_cargo_check" CHECK ("volumes" > 0 and "weight_kg" > 0),
	CONSTRAINT "pickup_requests_refusal_note_check" CHECK ("status" <> 'refused' or length(btrim(coalesce("decision_note", ''))) > 0),
	CONSTRAINT "pickup_requests_contractor_required_check" CHECK ("source" <> 'portal' or "contractor_id" is not null)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "pickup_requests_company_source_idempotency_unique" ON "pickup_requests" ("company_id","source","idempotency_key");--> statement-breakpoint
CREATE INDEX "pickup_requests_company_status_idx" ON "pickup_requests" ("company_id","status","created_at");--> statement-breakpoint
CREATE INDEX "pickup_requests_company_contractor_idx" ON "pickup_requests" ("company_id","contractor_id");--> statement-breakpoint
CREATE INDEX "pickup_requests_open_expiry_idx" ON "pickup_requests" ("expires_at") WHERE "status" = 'requested';--> statement-breakpoint
ALTER TABLE "pickup_requests" ADD CONSTRAINT "pickup_requests_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "pickup_requests" ADD CONSTRAINT "pickup_requests_contractor_id_contractors_id_fkey" FOREIGN KEY ("contractor_id") REFERENCES "contractors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;