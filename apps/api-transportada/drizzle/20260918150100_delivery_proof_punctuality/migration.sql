ALTER TABLE "company_delivery_proof_settings" ADD COLUMN "proof_window_minutes" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "company_delivery_proof_settings" ADD COLUMN "proof_radius_meters" integer DEFAULT 300 NOT NULL;--> statement-breakpoint
ALTER TABLE "company_delivery_proof_settings" ADD COLUMN "late_penalty_points" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "company_delivery_proof_settings" ADD COLUMN "missing_penalty_points" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "company_delivery_proof_settings" ADD COLUMN "missing_after_hours" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD COLUMN "latitude" numeric(10,7);--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD COLUMN "longitude" numeric(10,7);--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD COLUMN "accuracy_meters" numeric(10,2);--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD COLUMN "captured_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD COLUMN "punctuality" varchar(16) DEFAULT 'not_required' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_delivery_proof_settings" ADD CONSTRAINT "company_delivery_proof_settings_proof_window_minutes_check" CHECK ("proof_window_minutes" between 5 and 1440);--> statement-breakpoint
ALTER TABLE "company_delivery_proof_settings" ADD CONSTRAINT "company_delivery_proof_settings_proof_radius_meters_check" CHECK ("proof_radius_meters" between 50 and 5000);--> statement-breakpoint
ALTER TABLE "company_delivery_proof_settings" ADD CONSTRAINT "company_delivery_proof_settings_late_penalty_points_check" CHECK ("late_penalty_points" between 0 and 100);--> statement-breakpoint
ALTER TABLE "company_delivery_proof_settings" ADD CONSTRAINT "company_delivery_proof_settings_missing_penalty_points_check" CHECK ("missing_penalty_points" between 0 and 100);--> statement-breakpoint
ALTER TABLE "company_delivery_proof_settings" ADD CONSTRAINT "company_delivery_proof_settings_missing_after_hours_check" CHECK ("missing_after_hours" between 1 and 168);--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD CONSTRAINT "trip_delivery_proofs_coordinates_check" CHECK (("latitude" is null) = ("longitude" is null));--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD CONSTRAINT "trip_delivery_proofs_latitude_range_check" CHECK ("latitude" is null or "latitude" between -90 and 90);--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD CONSTRAINT "trip_delivery_proofs_longitude_range_check" CHECK ("longitude" is null or "longitude" between -180 and 180);--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD CONSTRAINT "trip_delivery_proofs_punctuality_check" CHECK ("punctuality" in ('not_required', 'on_time', 'late', 'away', 'late_and_away'));