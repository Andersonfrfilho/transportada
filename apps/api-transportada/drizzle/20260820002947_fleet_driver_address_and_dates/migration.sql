ALTER TABLE "fleet_drivers" ADD COLUMN "license_expires_at" date;--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD COLUMN "birth_date" date;--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD COLUMN "postal_code" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD COLUMN "street" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD COLUMN "number" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD COLUMN "complement" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD COLUMN "district" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD COLUMN "city" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD COLUMN "state" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "fleet_drivers_company_license_number_unique" ON "fleet_drivers" ("company_id","license_number") WHERE length("license_number") > 0;--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD CONSTRAINT "fleet_drivers_dates_check" CHECK (("birth_date" is null or "birth_date" >= date '1900-01-01') and ("license_expires_at" is null or "license_expires_at" >= date '1900-01-01'));--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD CONSTRAINT "fleet_drivers_postal_code_check" CHECK (length("postal_code") = 0 or "postal_code" ~ '^[0-9]{8}$');--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD CONSTRAINT "fleet_drivers_address_state_check" CHECK (length("state") = 0 or "state" ~ '^[A-Z]{2}$');--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD CONSTRAINT "fleet_drivers_address_length_check" CHECK (length("street") <= 120 and length("number") <= 20 and length("complement") <= 60 and length("district") <= 60 and length("city") <= 60);