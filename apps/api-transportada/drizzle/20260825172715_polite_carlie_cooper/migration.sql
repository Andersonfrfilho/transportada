CREATE TABLE "aggregate_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"tax_id" varchar(14) NOT NULL,
	"user_id" text NOT NULL CONSTRAINT "aggregate_accounts_user_id_unique" UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aggregate_accounts_company_tax_id_unique" UNIQUE("company_id","tax_id")
);
--> statement-breakpoint
ALTER TABLE "aggregate_accounts" ADD CONSTRAINT "aggregate_accounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;