ALTER TABLE "fleet_vehicles" ALTER COLUMN "tare_weight_kg" SET DATA TYPE numeric(12,2) USING "tare_weight_kg"::numeric(12,2);--> statement-breakpoint
ALTER TABLE "fleet_vehicles" ALTER COLUMN "tare_weight_kg" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "fleet_vehicles" ALTER COLUMN "capacity_kg" SET DATA TYPE numeric(12,2) USING "capacity_kg"::numeric(12,2);--> statement-breakpoint
ALTER TABLE "fleet_vehicles" ALTER COLUMN "capacity_kg" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "fleet_vehicles" ALTER COLUMN "capacity_m3" SET DATA TYPE numeric(12,2) USING "capacity_m3"::numeric(12,2);--> statement-breakpoint
ALTER TABLE "fleet_vehicles" ALTER COLUMN "capacity_m3" SET DEFAULT '0';