-- Spec 281 T4 (RF2): configuracao do Evolution por empresa. Tabela nova, aditiva; a chave da instancia vai selada (secret_envelope), nunca em claro.
CREATE TABLE "whatsapp_evolution_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL CONSTRAINT "whatsapp_evolution_settings_company_id_unique" UNIQUE,
	"base_url" text NOT NULL,
	"instance_name" text NOT NULL,
	"secret_envelope" jsonb NOT NULL,
	"status" text DEFAULT 'disabled' NOT NULL,
	"default_provider" text DEFAULT 'meta' NOT NULL,
	"daily_cap" integer DEFAULT 50 NOT NULL,
	"min_interval_seconds" integer DEFAULT 15 NOT NULL,
	"connection_state" text DEFAULT 'unknown' NOT NULL,
	"connection_checked_at" timestamp with time zone,
	"risk_acknowledged_at" timestamp with time zone,
	"risk_acknowledged_by" uuid,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_evolution_settings_status_check" CHECK ("status" in ('active', 'disabled')),
	CONSTRAINT "whatsapp_evolution_settings_default_provider_check" CHECK ("default_provider" in ('meta', 'evolution')),
	CONSTRAINT "whatsapp_evolution_settings_connection_state_check" CHECK ("connection_state" in ('open', 'connecting', 'close', 'unknown')),
	CONSTRAINT "whatsapp_evolution_settings_instance_name_check" CHECK ("instance_name" ~ '^[A-Za-z0-9_-]{1,64}$'),
	CONSTRAINT "whatsapp_evolution_settings_base_url_check" CHECK ("base_url" ~ '^https?://[^/?#[:space:]]+$' and length("base_url") <= 255),
	CONSTRAINT "whatsapp_evolution_settings_daily_cap_check" CHECK ("daily_cap" between 1 and 1000),
	CONSTRAINT "whatsapp_evolution_settings_min_interval_check" CHECK ("min_interval_seconds" between 1 and 3600),
	CONSTRAINT "whatsapp_evolution_settings_active_requires_risk_ack_check" CHECK ("status" = 'disabled' or "risk_acknowledged_at" is not null),
	CONSTRAINT "whatsapp_evolution_settings_version_check" CHECK ("version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "whatsapp_evolution_settings" ADD CONSTRAINT "whatsapp_evolution_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;