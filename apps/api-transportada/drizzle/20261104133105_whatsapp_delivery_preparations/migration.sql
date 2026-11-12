-- Spec 293 T15: a entrega em preparo pelo WhatsApp, uma aberta por nota (as provas chegam antes da baixa). Aditiva: tabela nova.
CREATE TABLE "whatsapp_delivery_preparations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"document_number" text NOT NULL,
	"origin_channel" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"awaiting" text,
	"photos" jsonb DEFAULT '[]' NOT NULL,
	"skipped" jsonb DEFAULT '[]' NOT NULL,
	"received_by" text,
	"receiver_name" text,
	"latitude" numeric(9,6),
	"longitude" numeric(9,6),
	"location_captured_at" timestamp with time zone,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"version" bigint DEFAULT 1 NOT NULL,
	CONSTRAINT "whatsapp_delivery_preparations_status_check" CHECK ("status" in ('open', 'completed', 'cancelled', 'superseded')),
	CONSTRAINT "whatsapp_delivery_preparations_channel_check" CHECK ("origin_channel" in ('group', 'individual')),
	CONSTRAINT "whatsapp_delivery_preparations_received_by_check" CHECK ("received_by" is null or "received_by" in ('recipient', 'spouse', 'child', 'parent', 'sibling', 'other_relative', 'neighbor', 'doorman', 'employee', 'other')),
	CONSTRAINT "whatsapp_delivery_preparations_closed_check" CHECK (("status" = 'open') = ("closed_at" is null)),
	CONSTRAINT "whatsapp_delivery_preparations_location_check" CHECK (("latitude" is null) = ("longitude" is null)),
	CONSTRAINT "whatsapp_delivery_preparations_version_check" CHECK ("version" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_delivery_preparations_company_document_open_unique" ON "whatsapp_delivery_preparations" ("company_id","document_id") WHERE "status" = 'open';--> statement-breakpoint
CREATE INDEX "whatsapp_delivery_preparations_company_driver_status_idx" ON "whatsapp_delivery_preparations" ("company_id","driver_id","status");--> statement-breakpoint
ALTER TABLE "whatsapp_delivery_preparations" ADD CONSTRAINT "whatsapp_delivery_preparations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "whatsapp_delivery_preparations" ADD CONSTRAINT "whatsapp_delivery_preparations_company_driver_fk" FOREIGN KEY ("company_id","driver_id") REFERENCES "fleet_drivers"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "whatsapp_delivery_preparations" ADD CONSTRAINT "whatsapp_delivery_preparations_company_document_fk" FOREIGN KEY ("company_id","document_id") REFERENCES "trip_documents"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;