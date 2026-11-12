-- Spec 292 T1: o grupo de WhatsApp do motorista, 1 para 1 (um grupo por motorista, um motorista por grupo). Aditiva: tabela nova.
CREATE TABLE "fleet_driver_whatsapp_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"group_jid" text NOT NULL,
	"group_name" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fleet_driver_whatsapp_groups_company_driver_unique" UNIQUE("company_id","driver_id"),
	CONSTRAINT "fleet_driver_whatsapp_groups_company_group_unique" UNIQUE("company_id","group_jid"),
	CONSTRAINT "fleet_driver_whatsapp_groups_group_jid_check" CHECK ("group_jid" ~ '^[0-9]+(-[0-9]+)?@g\.us$')
);
--> statement-breakpoint
ALTER TABLE "fleet_driver_whatsapp_groups" ADD CONSTRAINT "fleet_driver_whatsapp_groups_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "fleet_driver_whatsapp_groups" ADD CONSTRAINT "fleet_driver_whatsapp_groups_company_driver_fk" FOREIGN KEY ("company_id","driver_id") REFERENCES "fleet_drivers"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;