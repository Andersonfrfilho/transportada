-- Spec 293 T15: a ocorrência em coleta pelo WhatsApp, uma aberta por motorista (foto, número e valor chegam antes do registro). Aditiva: tabela nova.
CREATE TABLE "whatsapp_occurrence_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"occurrence_type_id" uuid NOT NULL,
	"document_number" text NOT NULL,
	"origin_channel" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"awaiting" text,
	"photos" jsonb DEFAULT '[]' NOT NULL,
	"skipped" jsonb DEFAULT '[]' NOT NULL,
	"reference_number" text,
	"declared_amount" numeric(14,2),
	"latitude" numeric(9,6),
	"longitude" numeric(9,6),
	"location_captured_at" timestamp with time zone,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"version" bigint DEFAULT 1 NOT NULL,
	CONSTRAINT "whatsapp_occurrence_drafts_status_check" CHECK ("status" in ('open', 'completed', 'cancelled', 'superseded')),
	CONSTRAINT "whatsapp_occurrence_drafts_channel_check" CHECK ("origin_channel" in ('group', 'individual')),
	CONSTRAINT "whatsapp_occurrence_drafts_closed_check" CHECK (("status" = 'open') = ("closed_at" is null)),
	CONSTRAINT "whatsapp_occurrence_drafts_location_check" CHECK (("latitude" is null) = ("longitude" is null)),
	CONSTRAINT "whatsapp_occurrence_drafts_declared_amount_check" CHECK ("declared_amount" is null or "declared_amount" >= 0),
	CONSTRAINT "whatsapp_occurrence_drafts_version_check" CHECK ("version" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_occurrence_drafts_company_driver_open_unique" ON "whatsapp_occurrence_drafts" ("company_id","driver_id") WHERE "status" = 'open';--> statement-breakpoint
CREATE INDEX "whatsapp_occurrence_drafts_company_document_idx" ON "whatsapp_occurrence_drafts" ("company_id","document_id");--> statement-breakpoint
ALTER TABLE "whatsapp_occurrence_drafts" ADD CONSTRAINT "whatsapp_occurrence_drafts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "whatsapp_occurrence_drafts" ADD CONSTRAINT "whatsapp_occurrence_drafts_company_driver_fk" FOREIGN KEY ("company_id","driver_id") REFERENCES "fleet_drivers"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "whatsapp_occurrence_drafts" ADD CONSTRAINT "whatsapp_occurrence_drafts_company_document_fk" FOREIGN KEY ("company_id","document_id") REFERENCES "trip_documents"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "whatsapp_occurrence_drafts" ADD CONSTRAINT "whatsapp_occurrence_drafts_company_type_fk" FOREIGN KEY ("company_id","occurrence_type_id") REFERENCES "company_occurrence_types"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;