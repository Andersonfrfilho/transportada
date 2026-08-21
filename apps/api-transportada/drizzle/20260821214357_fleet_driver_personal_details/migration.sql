ALTER TABLE "fleet_drivers" ADD COLUMN "nationality" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD COLUMN "birth_city" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD COLUMN "birth_state" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD COLUMN "father_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD COLUMN "mother_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD COLUMN "license_issued_city" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD COLUMN "license_issued_state" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD CONSTRAINT "fleet_drivers_birth_state_check" CHECK (length("birth_state") = 0 or "birth_state" ~ '^[A-Z]{2}$');--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD CONSTRAINT "fleet_drivers_license_issued_state_check" CHECK (length("license_issued_state") = 0 or "license_issued_state" ~ '^[A-Z]{2}$');--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD CONSTRAINT "fleet_drivers_personal_length_check" CHECK (length("nationality") <= 40 and length("birth_city") <= 60 and length("father_name") <= 60 and length("mother_name") <= 60 and length("license_issued_city") <= 60);