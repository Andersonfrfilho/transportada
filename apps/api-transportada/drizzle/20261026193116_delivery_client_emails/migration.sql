CREATE TABLE "delivery_client_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"tax_id" text NOT NULL,
	"purpose" text NOT NULL,
	"address" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"created_by_kind" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_client_emails_purpose_check" CHECK ("purpose" in ('boleto', 'invoice', 'finance', 'general')),
	CONSTRAINT "delivery_client_emails_address_check" CHECK (length("address") <= 254 and "address" ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
	CONSTRAINT "delivery_client_emails_label_check" CHECK (length("label") <= 60),
	CONSTRAINT "delivery_client_emails_created_by_kind_check" CHECK ("created_by_kind" in ('office', 'driver'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_client_emails_client_purpose_address_unique" ON "delivery_client_emails" ("company_id","tax_id","purpose",lower("address"));--> statement-breakpoint
CREATE INDEX "delivery_client_emails_client_purpose_idx" ON "delivery_client_emails" ("company_id","tax_id","purpose");--> statement-breakpoint
ALTER TABLE "delivery_client_emails" ADD CONSTRAINT "delivery_client_emails_client_fk" FOREIGN KEY ("company_id","tax_id") REFERENCES "delivery_clients"("company_id","tax_id") ON DELETE CASCADE ON UPDATE CASCADE;