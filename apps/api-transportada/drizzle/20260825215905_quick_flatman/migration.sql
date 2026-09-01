ALTER TABLE "fleet_drivers" ADD COLUMN "pix_key_type" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD COLUMN "pix_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD CONSTRAINT "fleet_drivers_pix_key_type_check" CHECK (length("pix_key_type") = 0 or "pix_key_type" in ('cpf', 'cnpj', 'email', 'phone', 'random'));--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD CONSTRAINT "fleet_drivers_pix_key_check" CHECK (length("pix_key") <= 140 and (length("pix_key") = 0) = (length("pix_key_type") = 0));