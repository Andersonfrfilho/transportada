CREATE TABLE "company_freight_quote_settings" (
	"company_id" uuid PRIMARY KEY,
	"margin_percent" numeric(9,4) NOT NULL,
	"expected_occupancy_percent" numeric(9,4) NOT NULL,
	"driver_cost_per_km" numeric(19,4) NOT NULL,
	"maintenance_cost_per_km" numeric(19,4) NOT NULL,
	"tires_cost_per_km" numeric(19,4) NOT NULL,
	"fixed_cost_per_km" numeric(19,4) NOT NULL,
	"ad_valorem_percent" numeric(9,4) NOT NULL,
	"gris_percent" numeric(9,4) NOT NULL,
	"fuel_km_per_liter" numeric(9,4),
	"apply_antt_floor" boolean NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_freight_quote_settings_margin_check" CHECK ("margin_percent" >= 0 and "margin_percent" < 100),
	CONSTRAINT "company_freight_quote_settings_occupancy_check" CHECK ("expected_occupancy_percent" > 0 and "expected_occupancy_percent" <= 100),
	CONSTRAINT "company_freight_quote_settings_costs_check" CHECK ("driver_cost_per_km" >= 0 and "maintenance_cost_per_km" >= 0 and "tires_cost_per_km" >= 0 and "fixed_cost_per_km" >= 0),
	CONSTRAINT "company_freight_quote_settings_rates_check" CHECK ("ad_valorem_percent" >= 0 and "ad_valorem_percent" <= 100 and "gris_percent" >= 0 and "gris_percent" <= 100),
	CONSTRAINT "company_freight_quote_settings_consumption_check" CHECK ("fuel_km_per_liter" is null or "fuel_km_per_liter" > 0)
);--> statement-breakpoint
ALTER TABLE "company_freight_quote_settings" ADD CONSTRAINT "company_freight_quote_settings_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
