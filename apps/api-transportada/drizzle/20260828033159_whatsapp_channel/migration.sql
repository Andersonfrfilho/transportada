CREATE TABLE "whatsapp_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL CONSTRAINT "whatsapp_channels_company_id_unique" UNIQUE,
	"phone_number_id" text NOT NULL CONSTRAINT "whatsapp_channels_phone_number_id_unique" UNIQUE,
	"waba_id" text NOT NULL,
	"display_phone_number" text DEFAULT '' NOT NULL,
	"secret_envelope" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_channels_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "whatsapp_channels_status_check" CHECK ("status" in ('active', 'disabled')),
	CONSTRAINT "whatsapp_channels_phone_number_id_check" CHECK ("phone_number_id" ~ '^[0-9]{5,32}$'),
	CONSTRAINT "whatsapp_channels_waba_id_check" CHECK ("waba_id" ~ '^[0-9]{5,32}$'),
	CONSTRAINT "whatsapp_channels_display_number_check" CHECK ("display_phone_number" = '' or "display_phone_number" ~ '^[0-9]{10,15}$'),
	CONSTRAINT "whatsapp_channels_version_check" CHECK ("version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "whatsapp_channels" ADD CONSTRAINT "whatsapp_channels_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;