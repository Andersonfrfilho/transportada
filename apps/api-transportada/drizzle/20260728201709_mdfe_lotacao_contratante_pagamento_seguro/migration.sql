ALTER TABLE "company_fiscal_profiles" ADD COLUMN "mdfe_insurance_responsibility" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_fiscal_profiles" ADD COLUMN "mdfe_insurer_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_fiscal_profiles" ADD COLUMN "mdfe_insurer_tax_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_fiscal_profiles" ADD COLUMN "mdfe_insurance_policy" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_fiscal_profiles" ADD COLUMN "mdfe_payment_bank_code" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_fiscal_profiles" ADD COLUMN "mdfe_payment_bank_branch" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_fiscal_profiles" ADD COLUMN "mdfe_payment_pix_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mdfe_manifests" ADD COLUMN "contractor_tax_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mdfe_manifests" ADD COLUMN "contractor_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mdfe_manifests" ADD COLUMN "freight_value" numeric(15,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "mdfe_manifests" ADD COLUMN "loading_postal_code" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mdfe_manifests" ADD COLUMN "discharge_postal_code" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "mdfe_manifests" ADD COLUMN "insurance_endorsement" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_fiscal_profiles" ADD CONSTRAINT "company_fiscal_profiles_mdfe_insurance_responsibility_check" CHECK (length("mdfe_insurance_responsibility") = 0 or "mdfe_insurance_responsibility" in ('1', '2'));--> statement-breakpoint
ALTER TABLE "company_fiscal_profiles" ADD CONSTRAINT "company_fiscal_profiles_mdfe_insurer_tax_id_check" CHECK (length("mdfe_insurer_tax_id") = 0 or "mdfe_insurer_tax_id" ~ '^[0-9]{11}$|^[0-9]{14}$');--> statement-breakpoint
ALTER TABLE "mdfe_manifests" ADD CONSTRAINT "mdfe_manifests_freight_value_check" CHECK ("freight_value" >= 0);--> statement-breakpoint
ALTER TABLE "mdfe_manifests" ADD CONSTRAINT "mdfe_manifests_contractor_tax_id_check" CHECK (length("contractor_tax_id") = 0 or "contractor_tax_id" ~ '^[0-9]{11}$|^[0-9]{14}$');--> statement-breakpoint
ALTER TABLE "mdfe_manifests" ADD CONSTRAINT "mdfe_manifests_postal_code_check" CHECK ((length("loading_postal_code") = 0 or "loading_postal_code" ~ '^[0-9]{8}$') and (length("discharge_postal_code") = 0 or "discharge_postal_code" ~ '^[0-9]{8}$'));