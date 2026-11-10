CREATE TABLE "company_field_report_hold_settings" (
	"company_id" uuid PRIMARY KEY,
	"hold_enabled" boolean DEFAULT false NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_field_report_holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"operation" text NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"trip_document_id" uuid,
	"stop_id" uuid,
	"payload" jsonb NOT NULL,
	"tapped_at" timestamp with time zone NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"state" text DEFAULT 'held' NOT NULL,
	"probable_duplicate_of" text,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_reason" text,
	"released_result_id" uuid,
	CONSTRAINT "trip_field_report_holds_company_key_unique" UNIQUE("company_id","idempotency_key"),
	CONSTRAINT "trip_field_report_holds_key_check" CHECK (length("idempotency_key") > 0),
	CONSTRAINT "trip_field_report_holds_state_check" CHECK ("state" in ('held', 'released', 'discarded')),
	CONSTRAINT "trip_field_report_holds_decision_check" CHECK (("state" = 'held') = ("decided_at" is null))
);
--> statement-breakpoint
CREATE INDEX "trip_field_report_holds_company_state_idx" ON "trip_field_report_holds" ("company_id","state","received_at");--> statement-breakpoint
ALTER TABLE "company_field_report_hold_settings" ADD CONSTRAINT "company_field_report_hold_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_field_report_holds" ADD CONSTRAINT "trip_field_report_holds_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_field_report_holds" ADD CONSTRAINT "trip_field_report_holds_actor_membership_fk" FOREIGN KEY ("actor_user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_field_report_holds" ADD CONSTRAINT "trip_field_report_holds_company_document_fk" FOREIGN KEY ("company_id","trip_document_id") REFERENCES "trip_documents"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;