CREATE TABLE "nfe_package_box_measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"package_box_id" uuid NOT NULL,
	"source" varchar(16) NOT NULL,
	"length_mm" integer NOT NULL,
	"width_mm" integer NOT NULL,
	"height_mm" integer NOT NULL,
	"length_margin_mm" integer,
	"width_margin_mm" integer,
	"height_margin_mm" integer,
	"warnings" varchar(32)[] DEFAULT '{}'::varchar(32)[] NOT NULL,
	"imprecise_confirmed" boolean DEFAULT false NOT NULL,
	"engine" varchar(32),
	"proposed_length_mm" integer,
	"proposed_width_mm" integer,
	"proposed_height_mm" integer,
	"measured_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nfe_package_box_measurements_source_check" CHECK ("source" in ('typed', 'camera', 'camera_adjusted')),
	CONSTRAINT "nfe_package_box_measurements_dimensions_check" CHECK ("length_mm" > 0 and "length_mm" <= 6000 and "width_mm" > 0 and "width_mm" <= 3000 and "height_mm" > 0 and "height_mm" <= 3000),
	CONSTRAINT "nfe_package_box_measurements_margin_range_check" CHECK (("length_margin_mm" is null or ("length_margin_mm" >= 0 and "length_margin_mm" <= 3000)) and ("width_margin_mm" is null or ("width_margin_mm" >= 0 and "width_margin_mm" <= 3000)) and ("height_margin_mm" is null or ("height_margin_mm" >= 0 and "height_margin_mm" <= 3000))),
	CONSTRAINT "nfe_package_box_measurements_typed_pairing_check" CHECK ("source" <> 'typed' or ("length_margin_mm" is null and "width_margin_mm" is null and "height_margin_mm" is null and "proposed_length_mm" is null and "proposed_width_mm" is null and "proposed_height_mm" is null and "engine" is null)),
	CONSTRAINT "nfe_package_box_measurements_camera_engine_check" CHECK ("source" = 'typed' or "engine" is not null),
	CONSTRAINT "nfe_package_box_measurements_warnings_domain_check" CHECK ("warnings" <@ ARRAY['markerNotFound', 'markerTooSmall', 'steepAngle', 'lowLight', 'blurry', 'boxOutOfFrame', 'unstable']::varchar(32)[])
);
--> statement-breakpoint
ALTER TABLE "nfe_package_boxes" ADD COLUMN "measurement_source" varchar(16);--> statement-breakpoint
ALTER TABLE "nfe_package_boxes" ADD COLUMN "measurement_margin_mm" integer;--> statement-breakpoint
ALTER TABLE "company_cargo_settings" ADD COLUMN "camera_measurement_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "nfe_package_boxes" ADD CONSTRAINT "nfe_package_boxes_company_id_id_unique" UNIQUE("company_id","id");--> statement-breakpoint
CREATE INDEX "nfe_package_box_measurements_company_package_box_idx" ON "nfe_package_box_measurements" ("company_id","package_box_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "nfe_package_box_measurements_company_created_idx" ON "nfe_package_box_measurements" ("company_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "nfe_package_box_measurements" ADD CONSTRAINT "nfe_package_box_measurements_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfe_package_box_measurements" ADD CONSTRAINT "nfe_package_box_measurements_company_package_box_fk" FOREIGN KEY ("company_id","package_box_id") REFERENCES "nfe_package_boxes"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfe_package_boxes" ADD CONSTRAINT "nfe_package_boxes_measurement_source_check" CHECK ("measurement_source" is null or "measurement_source" in ('typed', 'camera', 'camera_adjusted'));--> statement-breakpoint
ALTER TABLE "nfe_package_boxes" ADD CONSTRAINT "nfe_package_boxes_measurement_margin_check" CHECK ("measurement_margin_mm" is null or ("measurement_margin_mm" >= 0 and "measurement_margin_mm" <= 3000));--> statement-breakpoint
ALTER TABLE "nfe_package_boxes" ADD CONSTRAINT "nfe_package_boxes_measurement_source_pairing_check" CHECK ("measurement_source" is null or "length_mm" is not null);--> statement-breakpoint
ALTER TABLE "nfe_package_boxes" ADD CONSTRAINT "nfe_package_boxes_measurement_margin_pairing_check" CHECK ("measurement_source" <> 'typed' or "measurement_margin_mm" is null);