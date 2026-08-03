DROP INDEX "fleet_driver_vehicle_assignments_live_vehicle_unique";--> statement-breakpoint
DROP INDEX "fleet_driver_vehicle_assignments_live_driver_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "fleet_driver_vehicle_assignments_live_link_unique" ON "fleet_driver_vehicle_assignments" ("company_id","driver_id","vehicle_id") WHERE "released_at" is null;--> statement-breakpoint
CREATE INDEX "fleet_driver_vehicle_assignments_company_vehicle_idx" ON "fleet_driver_vehicle_assignments" ("company_id","vehicle_id");