-- Pedido do bot ao escritório para despachar uma viagem planejada quando o motorista manda "saí"/"cheguei".
-- Aditiva: só uma tabela nova, sem tocar nas existentes. Um pedido aberto por viagem (índice parcial).
CREATE TABLE "trip_dispatch_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"group_jid" text NOT NULL,
	"responder_user_id" uuid NOT NULL,
	"responder_phone" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"pending_events" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"reminded_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"resolution_note" text,
	CONSTRAINT "trip_dispatch_requests_company_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "trip_dispatch_requests_status_check" CHECK ("status" in ('open', 'approved', 'declined', 'expired', 'failed')),
	CONSTRAINT "trip_dispatch_requests_resolved_check" CHECK (("status" = 'open') = ("resolved_at" is null)),
	CONSTRAINT "trip_dispatch_requests_responder_phone_check" CHECK ("responder_phone" ~ '^[0-9]{8,20}$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "trip_dispatch_requests_company_trip_open_unique" ON "trip_dispatch_requests" ("company_id","trip_id") WHERE "status" = 'open';--> statement-breakpoint
CREATE INDEX "trip_dispatch_requests_open_expires_idx" ON "trip_dispatch_requests" ("expires_at") WHERE "status" = 'open';--> statement-breakpoint
CREATE INDEX "trip_dispatch_requests_open_responder_idx" ON "trip_dispatch_requests" ("company_id","responder_phone") WHERE "status" = 'open';--> statement-breakpoint
ALTER TABLE "trip_dispatch_requests" ADD CONSTRAINT "trip_dispatch_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_dispatch_requests" ADD CONSTRAINT "trip_dispatch_requests_company_trip_fk" FOREIGN KEY ("company_id","trip_id") REFERENCES "trips"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_dispatch_requests" ADD CONSTRAINT "trip_dispatch_requests_company_driver_fk" FOREIGN KEY ("company_id","driver_id") REFERENCES "fleet_drivers"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;