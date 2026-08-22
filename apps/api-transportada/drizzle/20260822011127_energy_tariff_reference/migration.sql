CREATE TABLE "energy_tariff_references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"distributor_code" varchar(40) NOT NULL,
	"distributor_name" varchar(160) NOT NULL,
	"subgroup" varchar(10) NOT NULL,
	"modality" varchar(20) NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date NOT NULL,
	"tusd_per_megawatt_hour" numeric(19,4) NOT NULL,
	"te_per_megawatt_hour" numeric(19,4) NOT NULL,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "energy_tariff_references_natural_unique" UNIQUE("distributor_code","subgroup","modality","effective_from"),
	CONSTRAINT "energy_tariff_references_distributor_check" CHECK (length("distributor_code") > 0 and "distributor_code" = upper("distributor_code") and length("distributor_name") > 0),
	CONSTRAINT "energy_tariff_references_scope_check" CHECK (length("subgroup") > 0 and length("modality") > 0),
	CONSTRAINT "energy_tariff_references_period_check" CHECK ("effective_to" >= "effective_from"),
	CONSTRAINT "energy_tariff_references_parcel_check" CHECK ("tusd_per_megawatt_hour" >= 0 and "te_per_megawatt_hour" >= 0 and "tusd_per_megawatt_hour" + "te_per_megawatt_hour" > 0)
);
--> statement-breakpoint
CREATE TABLE "company_energy_settings" (
	"company_id" uuid PRIMARY KEY,
	"distributor_code" varchar(40) NOT NULL,
	"adjustment_factor" numeric(6,4) DEFAULT '1.0000' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_energy_settings_distributor_code_check" CHECK (length("distributor_code") > 0 and "distributor_code" = upper("distributor_code")),
	CONSTRAINT "company_energy_settings_adjustment_factor_check" CHECK ("adjustment_factor" > 0)
);
--> statement-breakpoint
ALTER TABLE "company_energy_settings" ADD CONSTRAINT "company_energy_settings_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;