CREATE TABLE "trip_document_release_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"trip_document_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"channel" varchar(16) NOT NULL,
	"scope" varchar(16) NOT NULL,
	"stop_label" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_document_release_events_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "trip_document_release_events_channel_check" CHECK ("channel" in ('driver_app', 'office', 'whatsapp', 'backoffice')),
	CONSTRAINT "trip_document_release_events_scope_check" CHECK ("scope" in ('document', 'stop')),
	CONSTRAINT "trip_document_release_events_note_check" CHECK ("note" is null or char_length("note") between 1 and 500)
);
--> statement-breakpoint
CREATE INDEX "trip_document_release_events_company_trip_created_at_idx" ON "trip_document_release_events" ("company_id","trip_id","created_at");--> statement-breakpoint
ALTER TABLE "trip_document_release_events" ADD CONSTRAINT "trip_document_release_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_document_release_events" ADD CONSTRAINT "trip_document_release_events_company_trip_fk" FOREIGN KEY ("company_id","trip_id") REFERENCES "trips"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_document_release_events" ADD CONSTRAINT "trip_document_release_events_company_document_fk" FOREIGN KEY ("company_id","trip_document_id") REFERENCES "trip_documents"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;