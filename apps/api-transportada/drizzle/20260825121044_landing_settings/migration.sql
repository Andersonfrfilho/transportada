CREATE TABLE "landing_settings" (
	"cnpj_root" varchar(8) PRIMARY KEY,
	"brand_name" text,
	"contact_email" text,
	"contact_phone" text,
	"accent_color" varchar(7),
	"sections" jsonb DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "landing_settings_cnpj_root_check" CHECK ("cnpj_root" ~ '^[A-Z0-9]{8}$'),
	CONSTRAINT "landing_settings_accent_color_check" CHECK ("accent_color" is null or "accent_color" ~ '^#[0-9a-f]{6}$'),
	CONSTRAINT "landing_settings_sections_check" CHECK (jsonb_typeof("sections") = 'object')
);
