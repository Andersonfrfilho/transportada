ALTER TABLE "nfe_package_boxes" ADD COLUMN "unit_length_mm" integer;--> statement-breakpoint
ALTER TABLE "nfe_package_boxes" ADD COLUMN "unit_width_mm" integer;--> statement-breakpoint
ALTER TABLE "nfe_package_boxes" ADD COLUMN "unit_height_mm" integer;--> statement-breakpoint
ALTER TABLE "nfe_package_boxes" ADD COLUMN "unit_gross_weight_grams" integer;--> statement-breakpoint
ALTER TABLE "nfe_package_boxes" ADD COLUMN "unit_measurement_source" varchar(32);--> statement-breakpoint
ALTER TABLE "nfe_package_boxes" ADD COLUMN "estimated_length_mm" integer;--> statement-breakpoint
ALTER TABLE "nfe_package_boxes" ADD COLUMN "estimated_width_mm" integer;--> statement-breakpoint
ALTER TABLE "nfe_package_boxes" ADD COLUMN "estimated_height_mm" integer;--> statement-breakpoint
ALTER TABLE "nfe_package_boxes" ADD COLUMN "estimated_volume_cm3" integer;--> statement-breakpoint
ALTER TABLE "nfe_package_boxes" ADD COLUMN "estimated_gross_weight_grams" integer;--> statement-breakpoint
ALTER TABLE "nfe_package_boxes" ADD COLUMN "estimated_arrangement" varchar(16);--> statement-breakpoint
ALTER TABLE "nfe_package_boxes" ADD COLUMN "estimated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "nfe_package_boxes" ADD CONSTRAINT "nfe_package_boxes_unit_dimensions_check" CHECK (("unit_length_mm" is null or "unit_length_mm" between 5 and 1500) and ("unit_width_mm" is null or "unit_width_mm" between 5 and 1500) and ("unit_height_mm" is null or "unit_height_mm" between 5 and 1500) and ("unit_gross_weight_grams" is null or "unit_gross_weight_grams" > 0));--> statement-breakpoint
ALTER TABLE "nfe_package_boxes" ADD CONSTRAINT "nfe_package_boxes_unit_measurement_source_check" CHECK ("unit_measurement_source" is null or "unit_measurement_source" in ('typed', 'catalog') or "unit_measurement_source" like 'manual:%');--> statement-breakpoint
ALTER TABLE "nfe_package_boxes" ADD CONSTRAINT "nfe_package_boxes_estimated_dimensions_check" CHECK (("estimated_length_mm" is null or "estimated_length_mm" between 20 and 2500) and ("estimated_width_mm" is null or "estimated_width_mm" between 20 and 2500) and ("estimated_height_mm" is null or "estimated_height_mm" between 20 and 2500) and ("estimated_volume_cm3" is null or "estimated_volume_cm3" > 0) and ("estimated_gross_weight_grams" is null or "estimated_gross_weight_grams" > 0));--> statement-breakpoint
ALTER TABLE "nfe_package_boxes" ADD CONSTRAINT "nfe_package_boxes_estimated_together_check" CHECK (("estimated_length_mm" is null and "estimated_width_mm" is null and "estimated_height_mm" is null and "estimated_at" is null) or ("estimated_length_mm" is not null and "estimated_width_mm" is not null and "estimated_height_mm" is not null and "estimated_at" is not null));