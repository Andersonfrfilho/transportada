CREATE TABLE "company_tax_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL CONSTRAINT "company_tax_settings_company_unique" UNIQUE,
	"federal_regime" text NOT NULL,
	"pis_rate" numeric(9,6) NOT NULL,
	"cofins_rate" numeric(9,6) NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_tax_settings_regime_check" CHECK ("federal_regime" in ('presumed', 'real', 'simple')),
	CONSTRAINT "company_tax_settings_rates_check" CHECK ("pis_rate" >= 0 and "pis_rate" < 1 and "cofins_rate" >= 0 and "cofins_rate" < 1)
);
--> statement-breakpoint
CREATE TABLE "trip_cost_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount" numeric(19,4) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_cost_entries_kind_check" CHECK ("kind" in ('toll', 'other')),
	CONSTRAINT "trip_cost_entries_amount_check" CHECK ("amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "trip_financial_parcels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"result_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"nature" text NOT NULL,
	"amount" numeric(19,4) NOT NULL,
	"source" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	CONSTRAINT "trip_financial_parcels_result_kind_unique" UNIQUE("result_id","kind"),
	CONSTRAINT "trip_financial_parcels_kind_check" CHECK ("kind" in ('driver', 'fuel', 'other_per_kilometer', 'delivery_charges', 'toll', 'manual', 'icms', 'pis_cofins')),
	CONSTRAINT "trip_financial_parcels_nature_check" CHECK ("nature" in ('cost', 'tax')),
	CONSTRAINT "trip_financial_parcels_source_check" CHECK ("source" in ('measured', 'estimated', 'missing', 'period')),
	CONSTRAINT "trip_financial_parcels_amount_check" CHECK (("source" in ('missing', 'period') and "amount" = 0) or "amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "trip_financial_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"revenue_amount" numeric(19,4) NOT NULL,
	"revenue_document_count" bigint NOT NULL,
	"revenue_expected_count" bigint NOT NULL,
	"tax_total" numeric(19,4) NOT NULL,
	"cost_total" numeric(19,4) NOT NULL,
	"net_amount" numeric(19,4) NOT NULL,
	"margin_rate" numeric(9,6),
	"is_complete" boolean NOT NULL,
	"assumptions" jsonb DEFAULT '{}' NOT NULL,
	"frozen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recalculation_reason" text DEFAULT '' NOT NULL,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_financial_results_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "trip_financial_results_trip_version_unique" UNIQUE("company_id","trip_id","version"),
	CONSTRAINT "trip_financial_results_version_check" CHECK ("version" > 0),
	CONSTRAINT "trip_financial_results_counts_check" CHECK ("revenue_document_count" >= 0 and "revenue_expected_count" >= "revenue_document_count"),
	CONSTRAINT "trip_financial_results_amounts_check" CHECK ("revenue_amount" >= 0 and "tax_total" >= 0 and "cost_total" >= 0),
	CONSTRAINT "trip_financial_results_reason_check" CHECK ("version" = 1 or length("recalculation_reason") > 0)
);
--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD COLUMN "payment_model" text DEFAULT 'route_table' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD COLUMN "fixed_amount" numeric(19,4);--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD COLUMN "payment_period" text;--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD COLUMN "payment_closing_day" bigint;--> statement-breakpoint
CREATE INDEX "trip_cost_entries_trip_idx" ON "trip_cost_entries" ("company_id","trip_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trip_financial_results_current_unique" ON "trip_financial_results" ("company_id","trip_id") WHERE "is_current";--> statement-breakpoint
CREATE INDEX "trip_financial_results_frozen_idx" ON "trip_financial_results" ("company_id","frozen_at");--> statement-breakpoint
ALTER TABLE "company_tax_settings" ADD CONSTRAINT "company_tax_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_cost_entries" ADD CONSTRAINT "trip_cost_entries_company_trip_fk" FOREIGN KEY ("company_id","trip_id") REFERENCES "trips"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_financial_parcels" ADD CONSTRAINT "trip_financial_parcels_result_fk" FOREIGN KEY ("company_id","result_id") REFERENCES "trip_financial_results"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_financial_results" ADD CONSTRAINT "trip_financial_results_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_financial_results" ADD CONSTRAINT "trip_financial_results_company_trip_fk" FOREIGN KEY ("company_id","trip_id") REFERENCES "trips"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD CONSTRAINT "fleet_drivers_payment_model_check" CHECK ("payment_model" in ('route_table', 'fixed'));--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD CONSTRAINT "fleet_drivers_payment_shape_check" CHECK (("payment_model" = 'fixed' and "fixed_amount" is not null and "fixed_amount" > 0 and "payment_period" is not null and "payment_closing_day" between 1 and 28) or ("payment_model" = 'route_table' and "fixed_amount" is null and "payment_period" is null and "payment_closing_day" is null));--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD CONSTRAINT "fleet_drivers_payment_period_check" CHECK ("payment_period" is null or "payment_period" in ('fortnightly', 'monthly'));