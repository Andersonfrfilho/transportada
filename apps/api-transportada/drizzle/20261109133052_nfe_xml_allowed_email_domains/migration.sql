CREATE TABLE "nfe_xml_allowed_email_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nfe_xml_allowed_email_domains_company_domain_unique" UNIQUE("company_id","domain"),
	CONSTRAINT "nfe_xml_allowed_email_domains_domain_check" CHECK ("domain" = lower("domain") and "domain" ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' and char_length("domain") <= 253),
	CONSTRAINT "nfe_xml_allowed_email_domains_public_provider_check" CHECK ("domain" not in ('gmail.com', 'googlemail.com', 'hotmail.com', 'outlook.com', 'live.com', 'msn.com', 'yahoo.com', 'yahoo.com.br', 'icloud.com', 'me.com', 'bol.com.br', 'uol.com.br', 'terra.com.br', 'ig.com.br', 'globo.com', 'protonmail.com', 'proton.me', 'aol.com')),
	CONSTRAINT "nfe_xml_allowed_email_domains_status_check" CHECK ("status" in ('active', 'inactive'))
);
--> statement-breakpoint
ALTER TABLE "nfe_xml_allowed_email_domains" ADD CONSTRAINT "nfe_xml_allowed_email_domains_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;