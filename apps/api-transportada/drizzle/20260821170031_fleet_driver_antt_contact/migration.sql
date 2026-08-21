ALTER TABLE "fleet_drivers" ADD COLUMN "linked_legal_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD COLUMN "email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD COLUMN "rntrc" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD COLUMN "antt_category" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD CONSTRAINT "fleet_drivers_linked_legal_name_check" CHECK (length("linked_legal_name") <= 60 and (length("linked_legal_name") = 0 or length("linked_tax_id") > 0));--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD CONSTRAINT "fleet_drivers_email_check" CHECK (length("email") = 0 or (length("email") <= 254 and "email" ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'));--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD CONSTRAINT "fleet_drivers_rntrc_check" CHECK (length("rntrc") = 0 or "rntrc" ~ '^0?[0-9]{8}$');--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD CONSTRAINT "fleet_drivers_antt_category_check" CHECK (length("antt_category") = 0 or "antt_category" in ('0', '1', '2'));