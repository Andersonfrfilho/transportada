ALTER TABLE "fleet_drivers" ADD COLUMN "linked_postal_code" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD COLUMN "linked_street" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD COLUMN "linked_number" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD COLUMN "linked_complement" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD COLUMN "linked_district" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD COLUMN "linked_city" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD COLUMN "linked_state" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD CONSTRAINT "fleet_drivers_linked_postal_code_check" CHECK (length("linked_postal_code") = 0 or "linked_postal_code" ~ '^[0-9]{8}$');--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD CONSTRAINT "fleet_drivers_linked_state_check" CHECK (length("linked_state") = 0 or "linked_state" ~ '^[A-Z]{2}$');--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD CONSTRAINT "fleet_drivers_linked_address_length_check" CHECK (length("linked_street") <= 120 and length("linked_number") <= 20 and length("linked_complement") <= 60 and length("linked_district") <= 60 and length("linked_city") <= 60);