CREATE TABLE "trip_document_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"trip_document_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	CONSTRAINT "trip_document_events_from_status_check" CHECK ("from_status" is null or "from_status" in ('pending', 'separated', 'loaded', 'delivered', 'returned')),
	CONSTRAINT "trip_document_events_to_status_check" CHECK ("to_status" in ('pending', 'separated', 'loaded', 'delivered', 'returned')),
	CONSTRAINT "trip_document_events_actual_transition_check" CHECK ("from_status" is distinct from "to_status")
);
--> statement-breakpoint
ALTER TABLE "trip_documents" ADD COLUMN "stop_id" uuid;--> statement-breakpoint
CREATE INDEX "trip_document_events_company_document_occurred_idx" ON "trip_document_events" ("company_id","trip_document_id","occurred_at");--> statement-breakpoint
CREATE INDEX "trip_documents_company_stop_idx" ON "trip_documents" ("company_id","stop_id");--> statement-breakpoint
ALTER TABLE "trip_document_events" ADD CONSTRAINT "trip_document_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_document_events" ADD CONSTRAINT "trip_document_events_actor_membership_fk" FOREIGN KEY ("actor_user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_document_events" ADD CONSTRAINT "trip_document_events_company_document_fk" FOREIGN KEY ("company_id","trip_document_id") REFERENCES "trip_documents"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_documents" ADD CONSTRAINT "trip_documents_company_stop_fk" FOREIGN KEY ("company_id","stop_id") REFERENCES "trip_stops"("company_id","id") ON DELETE SET NULL ON UPDATE CASCADE;