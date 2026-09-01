CREATE TABLE "company_cargo_settings" (
	"company_id" uuid PRIMARY KEY,
	"default_volume_weight" numeric(14,4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_cargo_settings_default_volume_weight_check" CHECK ("default_volume_weight" is null or "default_volume_weight" > 0)
);
--> statement-breakpoint
ALTER TABLE "company_cargo_settings" ADD CONSTRAINT "company_cargo_settings_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
