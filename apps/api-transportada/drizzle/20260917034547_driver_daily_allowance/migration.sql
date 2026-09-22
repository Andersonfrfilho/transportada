CREATE TABLE "company_driver_allowance_settings" (
	"company_id" uuid PRIMARY KEY,
	"daily_allowance_amount" numeric(19,4) NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_driver_allowance_settings_amount_check" CHECK ("daily_allowance_amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD COLUMN "daily_allowance_amount" numeric(19,4);--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "daily_allowance_days" integer;--> statement-breakpoint
ALTER TABLE "company_driver_allowance_settings" ADD CONSTRAINT "company_driver_allowance_settings_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD CONSTRAINT "fleet_drivers_daily_allowance_check" CHECK ("daily_allowance_amount" is null or "daily_allowance_amount" > 0);--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_daily_allowance_days_check" CHECK ("daily_allowance_days" is null or "daily_allowance_days" >= 1);