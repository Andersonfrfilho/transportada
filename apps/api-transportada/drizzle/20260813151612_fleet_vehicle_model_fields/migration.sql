ALTER TABLE "fleet_vehicles" ADD COLUMN "brand" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_vehicles" ADD COLUMN "model" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_vehicles" ADD COLUMN "model_year" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_vehicles" ADD COLUMN "fleet_number" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_vehicles" ADD COLUMN "axle_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_vehicles" ADD CONSTRAINT "fleet_vehicles_brand_check" CHECK (length("brand") <= 60);--> statement-breakpoint
ALTER TABLE "fleet_vehicles" ADD CONSTRAINT "fleet_vehicles_model_check" CHECK (length("model") <= 120);--> statement-breakpoint
ALTER TABLE "fleet_vehicles" ADD CONSTRAINT "fleet_vehicles_fleet_number_check" CHECK (length("fleet_number") <= 20);--> statement-breakpoint
ALTER TABLE "fleet_vehicles" ADD CONSTRAINT "fleet_vehicles_model_year_check" CHECK ("model_year" = 0 or "model_year" between 1900 and 2100);--> statement-breakpoint
ALTER TABLE "fleet_vehicles" ADD CONSTRAINT "fleet_vehicles_axle_count_check" CHECK ("axle_count" = 0 or "axle_count" between 2 and 9);