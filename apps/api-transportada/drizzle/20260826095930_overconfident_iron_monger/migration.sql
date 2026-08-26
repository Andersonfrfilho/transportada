CREATE TABLE "trip_field_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"operation" text NOT NULL,
	"result_id" uuid,
	"actor_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_field_reports_company_key_unique" UNIQUE("company_id","idempotency_key"),
	CONSTRAINT "trip_field_reports_key_check" CHECK (length("idempotency_key") > 0),
	CONSTRAINT "trip_field_reports_operation_check" CHECK (length("operation") > 0)
);
--> statement-breakpoint
CREATE TABLE "trip_stop_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"stop_id" uuid NOT NULL,
	"trip_document_id" uuid,
	"kind" text NOT NULL,
	"latitude" numeric(10,7),
	"longitude" numeric(10,7),
	"accuracy_meters" numeric(10,2),
	"captured_at" timestamp with time zone,
	"actor_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_stop_events_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "trip_stop_events_kind_check" CHECK ("kind" in ('arrived', 'delivered', 'returned', 'occurrence')),
	CONSTRAINT "trip_stop_events_coordinates_check" CHECK (("latitude" is null) = ("longitude" is null)),
	CONSTRAINT "trip_stop_events_latitude_range_check" CHECK ("latitude" is null or "latitude" between -90 and 90),
	CONSTRAINT "trip_stop_events_longitude_range_check" CHECK ("longitude" is null or "longitude" between -180 and 180),
	CONSTRAINT "trip_stop_events_accuracy_check" CHECK ("accuracy_meters" is null or "latitude" is not null)
);
--> statement-breakpoint
CREATE TABLE "trip_stop_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"stop_id" uuid NOT NULL,
	"trip_document_id" uuid,
	"kind" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"attachment_object_id" uuid,
	"actor_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_stop_occurrences_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "trip_stop_occurrences_kind_check" CHECK ("kind" in ('unexpected_charge', 'long_wait', 'dock_closed', 'appointment_required', 'damaged_goods', 'address_not_found', 'customer_closed', 'other'))
);
--> statement-breakpoint
CREATE INDEX "trip_stop_events_company_stop_created_at_idx" ON "trip_stop_events" ("company_id","stop_id","created_at");--> statement-breakpoint
CREATE INDEX "trip_stop_events_located_created_at_idx" ON "trip_stop_events" ("created_at") WHERE "latitude" is not null;--> statement-breakpoint
CREATE INDEX "trip_stop_occurrences_company_stop_created_at_idx" ON "trip_stop_occurrences" ("company_id","stop_id","created_at");--> statement-breakpoint
ALTER TABLE "trip_field_reports" ADD CONSTRAINT "trip_field_reports_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_field_reports" ADD CONSTRAINT "trip_field_reports_actor_membership_fk" FOREIGN KEY ("actor_user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_stop_events" ADD CONSTRAINT "trip_stop_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_stop_events" ADD CONSTRAINT "trip_stop_events_company_stop_fk" FOREIGN KEY ("company_id","stop_id") REFERENCES "trip_stops"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_stop_events" ADD CONSTRAINT "trip_stop_events_company_document_fk" FOREIGN KEY ("company_id","trip_document_id") REFERENCES "trip_documents"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_stop_events" ADD CONSTRAINT "trip_stop_events_actor_membership_fk" FOREIGN KEY ("actor_user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD CONSTRAINT "trip_stop_occurrences_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD CONSTRAINT "trip_stop_occurrences_company_stop_fk" FOREIGN KEY ("company_id","stop_id") REFERENCES "trip_stops"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD CONSTRAINT "trip_stop_occurrences_company_document_fk" FOREIGN KEY ("company_id","trip_document_id") REFERENCES "trip_documents"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD CONSTRAINT "trip_stop_occurrences_company_object_fk" FOREIGN KEY ("company_id","attachment_object_id") REFERENCES "stored_objects"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD CONSTRAINT "trip_stop_occurrences_actor_membership_fk" FOREIGN KEY ("actor_user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;