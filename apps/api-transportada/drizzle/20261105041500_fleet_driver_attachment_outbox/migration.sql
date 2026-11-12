-- Spec 091 T013: o pedido de leitura da CNH anexada à ficha do motorista (ADR-0053). Aditiva: tabela nova.
CREATE TABLE "fleet_driver_attachment_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"event_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"attachment_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"event_version" bigint DEFAULT 1 NOT NULL,
	"correlation_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempt" bigint DEFAULT 0 NOT NULL,
	"claim_owner" text,
	"claim_expires_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fleet_driver_attachment_outbox_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "fleet_driver_attachment_outbox_company_id_event_id_unique" UNIQUE("company_id","event_id"),
	CONSTRAINT "fleet_driver_attachment_outbox_event_type_check" CHECK ("event_type" in ('attachment.extraction.requested'))
);
--> statement-breakpoint
CREATE INDEX "fleet_driver_attachment_outbox_company_published_next_attempt_created_idx" ON "fleet_driver_attachment_outbox" ("company_id","published_at","next_attempt_at","created_at");--> statement-breakpoint
ALTER TABLE "fleet_driver_attachment_outbox" ADD CONSTRAINT "fleet_driver_attachment_outbox_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "fleet_driver_attachment_outbox" ADD CONSTRAINT "fleet_driver_attachment_outbox_company_attachment_fk" FOREIGN KEY ("company_id","attachment_id") REFERENCES "fleet_driver_attachments"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;