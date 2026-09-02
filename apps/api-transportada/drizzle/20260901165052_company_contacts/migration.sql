CREATE TABLE "company_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"is_whatsapp" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_contacts_company_kind_value_unique" UNIQUE("company_id","kind","value"),
	CONSTRAINT "company_contacts_kind_check" CHECK ("kind" in ('phone', 'email')),
	CONSTRAINT "company_contacts_whatsapp_check" CHECK ("kind" = 'phone' or "is_whatsapp" = false),
	CONSTRAINT "company_contacts_value_check" CHECK (("kind" = 'phone' and "value" ~ '^[0-9]{10,13}$') or ("kind" = 'email' and "value" ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
	CONSTRAINT "company_contacts_position_check" CHECK ("position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "company_social_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"network" text NOT NULL,
	"url" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_social_links_company_network_unique" UNIQUE("company_id","network"),
	CONSTRAINT "company_social_links_network_check" CHECK ("network" in ('website', 'instagram', 'facebook', 'linkedin', 'youtube', 'tiktok', 'x')),
	CONSTRAINT "company_social_links_url_check" CHECK ("url" ~ '^https://[^[:space:]]+$'),
	CONSTRAINT "company_social_links_position_check" CHECK ("position" >= 0)
);
--> statement-breakpoint
CREATE INDEX "company_contacts_company_position_idx" ON "company_contacts" ("company_id","position");--> statement-breakpoint
ALTER TABLE "company_contacts" ADD CONSTRAINT "company_contacts_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_social_links" ADD CONSTRAINT "company_social_links_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;