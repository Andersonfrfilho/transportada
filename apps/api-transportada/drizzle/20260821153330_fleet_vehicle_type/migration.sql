ALTER TABLE "fleet_vehicles" DROP CONSTRAINT "fleet_vehicles_wheel_type_check";--> statement-breakpoint
ALTER TABLE "fleet_vehicles" DROP CONSTRAINT "fleet_vehicles_freight_class_check";--> statement-breakpoint
ALTER TABLE "fleet_vehicles" ADD COLUMN "vehicle_type" varchar(20) DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "fleet_vehicles" SET "vehicle_type" = CASE
	WHEN length("freight_class") > 0 THEN "freight_class"
	WHEN "wheel_type" = '01' THEN 'truck'
	WHEN "wheel_type" = '02' THEN 'toco'
	WHEN "wheel_type" = '03' THEN 'tractor_unit'
	WHEN "wheel_type" = '04' THEN 'van'
	WHEN "wheel_type" = '05' THEN 'utility'
	WHEN "wheel_type" = '06' THEN 'other'
	ELSE ''
END;--> statement-breakpoint
ALTER TABLE "fleet_vehicles" DROP COLUMN "wheel_type";--> statement-breakpoint
ALTER TABLE "fleet_vehicles" DROP COLUMN "freight_class";--> statement-breakpoint
ALTER TABLE "fleet_vehicles" ADD CONSTRAINT "fleet_vehicles_vehicle_type_check" CHECK (("role" = 'traction') = ("vehicle_type" in ('motorcycle', 'car', 'utility', 'van', 'vuc', 'three_quarter', 'toco', 'truck', 'tractor_unit', 'other')));
