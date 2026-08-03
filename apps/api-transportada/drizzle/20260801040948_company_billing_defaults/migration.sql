ALTER TABLE "company_fiscal_profiles" ADD COLUMN "billing_bank_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_fiscal_profiles" ADD COLUMN "billing_bank_code" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_fiscal_profiles" ADD COLUMN "billing_bank_branch" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_fiscal_profiles" ADD COLUMN "billing_bank_account" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_fiscal_profiles" ADD COLUMN "billing_pix_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_fiscal_profiles" ADD COLUMN "billing_observations" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_fiscal_profiles" ADD CONSTRAINT "company_fiscal_profiles_billing_bank_code_check" CHECK (length("billing_bank_code") = 0 or "billing_bank_code" ~ '^[0-9]{3}$');--> statement-breakpoint
ALTER TABLE "company_fiscal_profiles" ADD CONSTRAINT "company_fiscal_profiles_billing_bank_branch_check" CHECK (length("billing_bank_branch") = 0 or "billing_bank_branch" ~ '^[0-9]{1,10}$');--> statement-breakpoint
ALTER TABLE "company_fiscal_profiles" ADD CONSTRAINT "company_fiscal_profiles_billing_observations_check" CHECK (length("billing_observations") <= 500);