-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Spec 316 T1.2: vendedor da contratante, ligação às contratantes (N:N) e carteira de clientes. Só tabelas novas, sem
-- UPDATE e sem tocar tabela existente. Os índices únicos de e-mail e de chave do telefone aceitam vários nulos (o vendedor
-- pode ter só um dos canais); a CHECK de canal exige ao menos um.
CREATE TABLE "contractor_salespeople" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"whatsapp_e164" text,
	"whatsapp_phone_key" text,
	"status" text DEFAULT 'active' NOT NULL,
	"membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_user_id" uuid,
	CONSTRAINT "contractor_salespeople_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "contractor_salespeople_company_email_unique" UNIQUE("company_id","email"),
	CONSTRAINT "contractor_salespeople_company_phone_key_unique" UNIQUE("company_id","whatsapp_phone_key"),
	CONSTRAINT "contractor_salespeople_name_check" CHECK (length(btrim("name")) between 1 and 120),
	CONSTRAINT "contractor_salespeople_status_check" CHECK ("status" in ('active', 'inactive')),
	CONSTRAINT "contractor_salespeople_channel_check" CHECK ("email" is not null or "whatsapp_e164" is not null),
	CONSTRAINT "contractor_salespeople_whatsapp_check" CHECK (("whatsapp_e164" is null) = ("whatsapp_phone_key" is null))
);
--> statement-breakpoint
CREATE TABLE "contractor_salesperson_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"link_id" uuid NOT NULL,
	"tax_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contractor_salesperson_clients_link_tax_id_unique" UNIQUE("link_id","tax_id")
);
--> statement-breakpoint
CREATE TABLE "contractor_salesperson_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"salesperson_id" uuid NOT NULL,
	"contractor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contractor_salesperson_links_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "contractor_salesperson_links_pair_unique" UNIQUE("salesperson_id","contractor_id")
);
--> statement-breakpoint
CREATE INDEX "contractor_salesperson_clients_client_idx" ON "contractor_salesperson_clients" ("company_id","tax_id");--> statement-breakpoint
CREATE INDEX "contractor_salesperson_links_contractor_idx" ON "contractor_salesperson_links" ("company_id","contractor_id");--> statement-breakpoint
ALTER TABLE "contractor_salespeople" ADD CONSTRAINT "contractor_salespeople_company_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "contractor_salesperson_clients" ADD CONSTRAINT "contractor_salesperson_clients_link_fk" FOREIGN KEY ("company_id","link_id") REFERENCES "contractor_salesperson_links"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "contractor_salesperson_clients" ADD CONSTRAINT "contractor_salesperson_clients_client_fk" FOREIGN KEY ("company_id","tax_id") REFERENCES "delivery_clients"("company_id","tax_id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "contractor_salesperson_links" ADD CONSTRAINT "contractor_salesperson_links_salesperson_fk" FOREIGN KEY ("company_id","salesperson_id") REFERENCES "contractor_salespeople"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "contractor_salesperson_links" ADD CONSTRAINT "contractor_salesperson_links_contractor_fk" FOREIGN KEY ("company_id","contractor_id") REFERENCES "contractors"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;