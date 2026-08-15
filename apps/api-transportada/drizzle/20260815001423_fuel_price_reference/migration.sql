CREATE TABLE "fuel_price_references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"product" varchar(20) NOT NULL,
	"state" char(2) NOT NULL,
	"week_ending_on" date NOT NULL,
	"price_per_unit" numeric(19,4) NOT NULL,
	"station_count" integer NOT NULL,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fuel_price_references_natural_unique" UNIQUE("product","state","week_ending_on"),
	CONSTRAINT "fuel_price_references_product_check" CHECK ("product" in ('diesel-s10', 'diesel-s500', 'gasolina-comum', 'etanol-hidratado', 'gnv')),
	CONSTRAINT "fuel_price_references_price_check" CHECK ("price_per_unit" > 0),
	CONSTRAINT "fuel_price_references_station_count_check" CHECK ("station_count" >= 0),
	CONSTRAINT "fuel_price_references_state_check" CHECK ("state" ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
CREATE TABLE "company_fuel_prices" (
	"company_id" uuid,
	"product" varchar(20),
	"price_per_unit" numeric(19,4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_fuel_prices_company_id_product_pk" PRIMARY KEY("company_id","product"),
	CONSTRAINT "company_fuel_prices_product_check" CHECK ("product" in ('diesel-s10', 'diesel-s500', 'gasolina-comum', 'etanol-hidratado', 'gnv')),
	CONSTRAINT "company_fuel_prices_price_check" CHECK ("price_per_unit" > 0)
);
--> statement-breakpoint
ALTER TABLE "fleet_vehicles" ADD COLUMN "fuel_type" varchar(20) DEFAULT 'diesel-s10' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_vehicles" ADD COLUMN "other_costs_per_kilometer" numeric(19,4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_vehicles" DROP CONSTRAINT "fleet_vehicles_cost_check";--> statement-breakpoint
ALTER TABLE "fleet_vehicles" DROP COLUMN "cost_per_kilometer";--> statement-breakpoint
ALTER TABLE "company_fuel_prices" ADD CONSTRAINT "company_fuel_prices_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "fleet_vehicles" ADD CONSTRAINT "fleet_vehicles_fuel_type_check" CHECK ("fuel_type" in ('diesel-s10', 'diesel-s500', 'gasolina-comum', 'etanol-hidratado', 'gnv'));--> statement-breakpoint
ALTER TABLE "fleet_vehicles" ADD CONSTRAINT "fleet_vehicles_cost_check" CHECK ("average_consumption" >= 0 and "other_costs_per_kilometer" >= 0 and "acquisition_amount" >= 0 and "monthly_installment_amount" >= 0 and "annual_vehicle_tax_amount" >= 0 and "annual_insurance_amount" >= 0);