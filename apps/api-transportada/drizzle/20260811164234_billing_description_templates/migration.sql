CREATE TABLE "billing_description_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"body" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_description_templates_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "billing_description_templates_company_name_unique" UNIQUE("company_id","name"),
	CONSTRAINT "billing_description_templates_name_check" CHECK (length(btrim("name")) between 1 and 120),
	CONSTRAINT "billing_description_templates_body_check" CHECK (length("body") between 1 and 500)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "billing_description_templates_company_default_unique" ON "billing_description_templates" ("company_id") WHERE "is_default";--> statement-breakpoint
ALTER TABLE "billing_description_templates" ADD CONSTRAINT "billing_description_templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
INSERT INTO "billing_description_templates" ("company_id", "name", "body", "is_default")
SELECT "company_id", 'Padrão', "billing_observations", true
  FROM "company_fiscal_profiles"
 WHERE btrim("billing_observations") <> '';