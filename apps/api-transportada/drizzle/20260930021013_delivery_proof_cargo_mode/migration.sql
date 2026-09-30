ALTER TABLE "company_delivery_proof_settings" ADD COLUMN "cargo" text DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_delivery_proof_settings" ADD COLUMN "cargo_minimum_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_proof_setting_contractor_overrides" ADD COLUMN "cargo" text DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_proof_setting_contractor_overrides" ADD COLUMN "cargo_minimum_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_proof_setting_overrides" ADD COLUMN "cargo" text DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_proof_setting_overrides" ADD COLUMN "cargo_minimum_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "company_delivery_proof_settings" ADD CONSTRAINT "company_delivery_proof_settings_cargo_check" CHECK ("cargo" in ('required', 'optional', 'off'));--> statement-breakpoint
ALTER TABLE "company_delivery_proof_settings" ADD CONSTRAINT "company_delivery_proof_settings_cargo_minimum_count_check" CHECK ("cargo_minimum_count" between 1 and 5);--> statement-breakpoint
ALTER TABLE "delivery_proof_setting_contractor_overrides" ADD CONSTRAINT "delivery_proof_setting_contractor_overrides_cargo_check" CHECK ("cargo" in ('required', 'optional', 'off'));--> statement-breakpoint
ALTER TABLE "delivery_proof_setting_contractor_overrides" ADD CONSTRAINT "delivery_proof_setting_contractor_overrides_cargo_minimum_count_check" CHECK ("cargo_minimum_count" between 1 and 5);--> statement-breakpoint
ALTER TABLE "delivery_proof_setting_overrides" ADD CONSTRAINT "delivery_proof_setting_overrides_cargo_check" CHECK ("cargo" in ('required', 'optional', 'off'));--> statement-breakpoint
ALTER TABLE "delivery_proof_setting_overrides" ADD CONSTRAINT "delivery_proof_setting_overrides_cargo_minimum_count_check" CHECK ("cargo_minimum_count" between 1 and 5);