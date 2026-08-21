CREATE TABLE "fleet_driver_regions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"region_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"state" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fleet_driver_regions_driver_entry_unique" UNIQUE("company_id","driver_id","region_id","scope","city"),
	CONSTRAINT "fleet_driver_regions_scope_check" CHECK ("scope" in ('region', 'city')),
	CONSTRAINT "fleet_driver_regions_city_check" CHECK (case when "scope" = 'city' then length("city") > 0 and "state" ~ '^[A-Z]{2}$' else length("city") = 0 and length("state") = 0 end)
);
--> statement-breakpoint
CREATE TABLE "freight_region_cities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"region_id" uuid NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "freight_region_cities_region_city_unique" UNIQUE("company_id","region_id","city","state"),
	CONSTRAINT "freight_region_cities_city_check" CHECK (length("city") > 0),
	CONSTRAINT "freight_region_cities_state_check" CHECK ("state" ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
CREATE TABLE "freight_region_driver_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"region_id" uuid NOT NULL,
	"freight_class" varchar(20) NOT NULL,
	"driver_amount" numeric(19,4) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "freight_region_driver_rates_region_class_unique" UNIQUE("company_id","region_id","freight_class"),
	CONSTRAINT "freight_region_driver_rates_class_check" CHECK ("freight_class" in ('utility', 'van', 'vuc', 'three_quarter', 'toco', 'truck')),
	CONSTRAINT "freight_region_driver_rates_amount_check" CHECK ("driver_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "freight_regions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"zone" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "freight_regions_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "freight_regions_company_id_code_unique" UNIQUE("company_id","code"),
	CONSTRAINT "freight_regions_code_check" CHECK ("code" ~ '^[0-9]\.00[0-3]$'),
	CONSTRAINT "freight_regions_name_check" CHECK (length("name") > 0),
	CONSTRAINT "freight_regions_zone_check" CHECK ("zone" between 0 and 4),
	CONSTRAINT "freight_regions_status_check" CHECK ("status" in ('active', 'inactive')),
	CONSTRAINT "freight_regions_version_check" CHECK ("version" > 0)
);
--> statement-breakpoint
ALTER TABLE "fleet_vehicles" ADD COLUMN "freight_class" varchar(20) DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "fleet_vehicles" SET "freight_class" = CASE "wheel_type"
	WHEN '01' THEN 'truck'
	WHEN '02' THEN 'toco'
	WHEN '04' THEN 'van'
	WHEN '05' THEN 'utility'
	ELSE ''
END;--> statement-breakpoint
CREATE INDEX "fleet_driver_regions_company_driver_idx" ON "fleet_driver_regions" ("company_id","driver_id");--> statement-breakpoint
CREATE INDEX "freight_region_cities_company_city_idx" ON "freight_region_cities" ("company_id","city","state");--> statement-breakpoint
CREATE INDEX "freight_regions_company_status_code_idx" ON "freight_regions" ("company_id","status","code");--> statement-breakpoint
ALTER TABLE "fleet_driver_regions" ADD CONSTRAINT "fleet_driver_regions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "fleet_driver_regions" ADD CONSTRAINT "fleet_driver_regions_company_driver_fk" FOREIGN KEY ("driver_id","company_id") REFERENCES "fleet_drivers"("id","company_id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "fleet_driver_regions" ADD CONSTRAINT "fleet_driver_regions_company_region_fk" FOREIGN KEY ("region_id","company_id") REFERENCES "freight_regions"("id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "freight_region_cities" ADD CONSTRAINT "freight_region_cities_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "freight_region_cities" ADD CONSTRAINT "freight_region_cities_company_region_fk" FOREIGN KEY ("region_id","company_id") REFERENCES "freight_regions"("id","company_id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "freight_region_driver_rates" ADD CONSTRAINT "freight_region_driver_rates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "freight_region_driver_rates" ADD CONSTRAINT "freight_region_driver_rates_company_region_fk" FOREIGN KEY ("region_id","company_id") REFERENCES "freight_regions"("id","company_id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "freight_regions" ADD CONSTRAINT "freight_regions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "fleet_vehicles" ADD CONSTRAINT "fleet_vehicles_freight_class_check" CHECK (length("freight_class") = 0 or "freight_class" in ('utility', 'van', 'vuc', 'three_quarter', 'toco', 'truck'));