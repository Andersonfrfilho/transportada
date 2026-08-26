ALTER TABLE "identity_user_profiles" ADD COLUMN "email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_user_profiles" ADD COLUMN "phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_user_profiles" ADD COLUMN "tax_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "identity_user_profiles_tax_id_unique" ON "identity_user_profiles" ("tax_id") WHERE length("tax_id") > 0;--> statement-breakpoint
ALTER TABLE "identity_user_profiles" ADD CONSTRAINT "identity_user_profiles_tax_id_check" CHECK (length("tax_id") = 0 or "tax_id" ~ '^[0-9]{11}$');