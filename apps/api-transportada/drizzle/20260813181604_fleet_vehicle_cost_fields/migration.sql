ALTER TABLE "fleet_vehicles" ADD COLUMN "average_consumption" numeric(6,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_vehicles" ADD COLUMN "cost_per_kilometer" numeric(12,4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_vehicles" ADD COLUMN "acquisition_amount" numeric(19,4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_vehicles" ADD COLUMN "monthly_installment_amount" numeric(19,4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_vehicles" ADD COLUMN "annual_vehicle_tax_amount" numeric(19,4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_vehicles" ADD COLUMN "annual_insurance_amount" numeric(19,4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_vehicles" ADD COLUMN "costs_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fleet_vehicles" ADD CONSTRAINT "fleet_vehicles_cost_check" CHECK ("average_consumption" >= 0 and "cost_per_kilometer" >= 0 and "acquisition_amount" >= 0 and "monthly_installment_amount" >= 0 and "annual_vehicle_tax_amount" >= 0 and "annual_insurance_amount" >= 0);