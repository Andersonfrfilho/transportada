-- Spec 292 T4: o pedido aberto no grupo do motorista (um por vez por grupo) e as mensagens aceitas (uma vez por id do provedor). Aditiva: tabelas novas e coluna com padrão.
CREATE TABLE "whatsapp_group_request_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"provider_message_id" text NOT NULL,
	"request_id" uuid,
	"sender_number" text NOT NULL,
	"via" text NOT NULL,
	"step_before" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_group_request_messages_company_provider_unique" UNIQUE("company_id","provider_message_id"),
	CONSTRAINT "whatsapp_group_request_messages_via_check" CHECK ("via" in ('mention', 'owner_reply'))
);
--> statement-breakpoint
CREATE TABLE "whatsapp_group_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"group_jid" text NOT NULL,
	"owner_number" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"step" text NOT NULL,
	"state" jsonb DEFAULT '{}' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"timeout_seconds" integer NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"version" bigint DEFAULT 1 NOT NULL,
	CONSTRAINT "whatsapp_group_requests_company_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "whatsapp_group_requests_status_check" CHECK ("status" in ('open', 'completed', 'cancelled', 'expired', 'abandoned')),
	CONSTRAINT "whatsapp_group_requests_closed_check" CHECK (("status" = 'open') = ("closed_at" is null)),
	CONSTRAINT "whatsapp_group_requests_owner_number_check" CHECK ("owner_number" ~ '^[0-9]{8,20}$'),
	CONSTRAINT "whatsapp_group_requests_attempts_check" CHECK ("attempts" >= 0),
	CONSTRAINT "whatsapp_group_requests_timeout_check" CHECK ("timeout_seconds" between 60 and 3600),
	CONSTRAINT "whatsapp_group_requests_version_check" CHECK ("version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "whatsapp_evolution_settings" ADD COLUMN "group_request_timeout_seconds" integer DEFAULT 600 NOT NULL;--> statement-breakpoint
CREATE INDEX "whatsapp_group_request_messages_request_idx" ON "whatsapp_group_request_messages" ("company_id","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_group_requests_company_group_open_unique" ON "whatsapp_group_requests" ("company_id","group_jid") WHERE "status" = 'open';--> statement-breakpoint
CREATE INDEX "whatsapp_group_requests_company_group_opened_idx" ON "whatsapp_group_requests" ("company_id","group_jid","opened_at");--> statement-breakpoint
ALTER TABLE "whatsapp_group_request_messages" ADD CONSTRAINT "whatsapp_group_request_messages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "whatsapp_group_request_messages" ADD CONSTRAINT "whatsapp_group_request_messages_request_fk" FOREIGN KEY ("company_id","request_id") REFERENCES "whatsapp_group_requests"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "whatsapp_group_requests" ADD CONSTRAINT "whatsapp_group_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "whatsapp_group_requests" ADD CONSTRAINT "whatsapp_group_requests_company_driver_fk" FOREIGN KEY ("company_id","driver_id") REFERENCES "fleet_drivers"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "whatsapp_evolution_settings" ADD CONSTRAINT "whatsapp_evolution_settings_group_request_timeout_check" CHECK ("group_request_timeout_seconds" between 60 and 3600);