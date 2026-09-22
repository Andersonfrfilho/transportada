ALTER TABLE "trip_delivery_proofs" ADD COLUMN "channel" varchar(16) DEFAULT 'driver_app' NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD COLUMN "on_behalf_of_driver_id" uuid;--> statement-breakpoint
ALTER TABLE "trip_document_events" ADD COLUMN "channel" varchar(16) DEFAULT 'driver_app' NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_document_events" ADD COLUMN "on_behalf_of_driver_id" uuid;--> statement-breakpoint
ALTER TABLE "trip_document_events" ADD COLUMN "recorded_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" ADD COLUMN "channel" varchar(16) DEFAULT 'driver_app' NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" ADD COLUMN "on_behalf_of_driver_id" uuid;--> statement-breakpoint
ALTER TABLE "trip_field_reports" ADD COLUMN "channel" varchar(16) DEFAULT 'driver_app' NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_field_reports" ADD COLUMN "on_behalf_of_driver_id" uuid;--> statement-breakpoint
ALTER TABLE "trip_stop_events" ADD COLUMN "channel" varchar(16) DEFAULT 'driver_app' NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_stop_events" ADD COLUMN "on_behalf_of_driver_id" uuid;--> statement-breakpoint
ALTER TABLE "trip_stop_events" ADD COLUMN "recorded_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD COLUMN "channel" varchar(16) DEFAULT 'driver_app' NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD COLUMN "on_behalf_of_driver_id" uuid;--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD CONSTRAINT "trip_delivery_proofs_company_driver_fk" FOREIGN KEY ("company_id","on_behalf_of_driver_id") REFERENCES "fleet_drivers"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_document_events" ADD CONSTRAINT "trip_document_events_company_driver_fk" FOREIGN KEY ("company_id","on_behalf_of_driver_id") REFERENCES "fleet_drivers"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" ADD CONSTRAINT "trip_document_occurrences_company_driver_fk" FOREIGN KEY ("company_id","on_behalf_of_driver_id") REFERENCES "fleet_drivers"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_field_reports" ADD CONSTRAINT "trip_field_reports_company_driver_fk" FOREIGN KEY ("company_id","on_behalf_of_driver_id") REFERENCES "fleet_drivers"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_stop_events" ADD CONSTRAINT "trip_stop_events_company_driver_fk" FOREIGN KEY ("company_id","on_behalf_of_driver_id") REFERENCES "fleet_drivers"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD CONSTRAINT "trip_stop_occurrences_company_driver_fk" FOREIGN KEY ("company_id","on_behalf_of_driver_id") REFERENCES "fleet_drivers"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD CONSTRAINT "trip_delivery_proofs_channel_check" CHECK ("channel" in ('driver_app', 'office', 'whatsapp'));--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD CONSTRAINT "trip_delivery_proofs_office_driver_check" CHECK ("channel" <> 'office' or "on_behalf_of_driver_id" is not null);--> statement-breakpoint
ALTER TABLE "trip_document_events" ADD CONSTRAINT "trip_document_events_channel_check" CHECK ("channel" in ('driver_app', 'office', 'whatsapp'));--> statement-breakpoint
ALTER TABLE "trip_document_events" ADD CONSTRAINT "trip_document_events_office_driver_check" CHECK ("channel" <> 'office' or "on_behalf_of_driver_id" is not null);--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" ADD CONSTRAINT "trip_document_occurrences_channel_check" CHECK ("channel" in ('driver_app', 'office', 'whatsapp'));--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" ADD CONSTRAINT "trip_document_occurrences_office_driver_check" CHECK ("channel" <> 'office' or "on_behalf_of_driver_id" is not null);--> statement-breakpoint
ALTER TABLE "trip_field_reports" ADD CONSTRAINT "trip_field_reports_channel_check" CHECK ("channel" in ('driver_app', 'office', 'whatsapp'));--> statement-breakpoint
ALTER TABLE "trip_field_reports" ADD CONSTRAINT "trip_field_reports_office_driver_check" CHECK ("channel" <> 'office' or "on_behalf_of_driver_id" is not null);--> statement-breakpoint
ALTER TABLE "trip_stop_events" ADD CONSTRAINT "trip_stop_events_channel_check" CHECK ("channel" in ('driver_app', 'office', 'whatsapp'));--> statement-breakpoint
ALTER TABLE "trip_stop_events" ADD CONSTRAINT "trip_stop_events_office_driver_check" CHECK ("channel" <> 'office' or "on_behalf_of_driver_id" is not null);--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD CONSTRAINT "trip_stop_occurrences_channel_check" CHECK ("channel" in ('driver_app', 'office', 'whatsapp'));--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD CONSTRAINT "trip_stop_occurrences_office_driver_check" CHECK ("channel" <> 'office' or "on_behalf_of_driver_id" is not null);