CREATE TABLE "trip_status_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"from_status" text NOT NULL,
	"to_status" text NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"channel" varchar(16) DEFAULT 'driver_app' NOT NULL,
	"on_behalf_of_driver_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_status_events_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "trip_status_events_channel_check" CHECK ("channel" in ('driver_app', 'office', 'whatsapp', 'backoffice')),
	CONSTRAINT "trip_status_events_office_driver_check" CHECK ("channel" <> 'office' or "on_behalf_of_driver_id" is not null),
	CONSTRAINT "trip_status_events_transition_check" CHECK ("from_status" <> "to_status"),
	CONSTRAINT "trip_status_events_from_status_check" CHECK ("from_status" in ('draft', 'route_planned', 'separating', 'loading', 'dispatched', 'in_transit', 'on_delivery_route', 'completed', 'cancelled')),
	CONSTRAINT "trip_status_events_to_status_check" CHECK ("to_status" in ('draft', 'route_planned', 'separating', 'loading', 'dispatched', 'in_transit', 'on_delivery_route', 'completed', 'cancelled'))
);
--> statement-breakpoint
CREATE INDEX "trip_status_events_company_trip_occurred_at_idx" ON "trip_status_events" ("company_id","trip_id","occurred_at","id");--> statement-breakpoint
ALTER TABLE "trip_status_events" ADD CONSTRAINT "trip_status_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_status_events" ADD CONSTRAINT "trip_status_events_company_trip_fk" FOREIGN KEY ("company_id","trip_id") REFERENCES "trips"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_status_events" ADD CONSTRAINT "trip_status_events_company_driver_fk" FOREIGN KEY ("company_id","on_behalf_of_driver_id") REFERENCES "fleet_drivers"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
-- ADR-0068 §3: NOT VALID + VALIDATE CONSTRAINT em vez de DROP+ADD — a lista antiga é subconjunto
-- da nova (nenhuma linha viola), e assim a varredura não segura ACCESS EXCLUSIVE durante o scan.
ALTER TABLE "trip_delivery_proofs" DROP CONSTRAINT "trip_delivery_proofs_channel_check";--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD CONSTRAINT "trip_delivery_proofs_channel_check" CHECK ("channel" in ('driver_app', 'office', 'whatsapp', 'backoffice')) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" VALIDATE CONSTRAINT "trip_delivery_proofs_channel_check";--> statement-breakpoint
ALTER TABLE "trip_document_events" DROP CONSTRAINT "trip_document_events_channel_check";--> statement-breakpoint
ALTER TABLE "trip_document_events" ADD CONSTRAINT "trip_document_events_channel_check" CHECK ("channel" in ('driver_app', 'office', 'whatsapp', 'backoffice')) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_document_events" VALIDATE CONSTRAINT "trip_document_events_channel_check";--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" DROP CONSTRAINT "trip_document_occurrences_channel_check";--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" ADD CONSTRAINT "trip_document_occurrences_channel_check" CHECK ("channel" in ('driver_app', 'office', 'whatsapp', 'backoffice')) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" VALIDATE CONSTRAINT "trip_document_occurrences_channel_check";--> statement-breakpoint
ALTER TABLE "trip_field_reports" DROP CONSTRAINT "trip_field_reports_channel_check";--> statement-breakpoint
ALTER TABLE "trip_field_reports" ADD CONSTRAINT "trip_field_reports_channel_check" CHECK ("channel" in ('driver_app', 'office', 'whatsapp', 'backoffice')) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_field_reports" VALIDATE CONSTRAINT "trip_field_reports_channel_check";--> statement-breakpoint
ALTER TABLE "trip_stop_events" DROP CONSTRAINT "trip_stop_events_channel_check";--> statement-breakpoint
ALTER TABLE "trip_stop_events" ADD CONSTRAINT "trip_stop_events_channel_check" CHECK ("channel" in ('driver_app', 'office', 'whatsapp', 'backoffice')) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_stop_events" VALIDATE CONSTRAINT "trip_stop_events_channel_check";--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" DROP CONSTRAINT "trip_stop_occurrences_channel_check";--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD CONSTRAINT "trip_stop_occurrences_channel_check" CHECK ("channel" in ('driver_app', 'office', 'whatsapp', 'backoffice')) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" VALIDATE CONSTRAINT "trip_stop_occurrences_channel_check";