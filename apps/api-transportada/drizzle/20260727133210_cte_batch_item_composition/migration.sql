CREATE TABLE "cte_batch_item_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"ordinal" bigint NOT NULL,
	"label" text NOT NULL,
	"calculation_type" text NOT NULL,
	"rate" numeric(9,6),
	"base_amount" numeric(19,4) NOT NULL,
	"amount" numeric(19,4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cte_batch_item_charges_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "cte_batch_item_charges_company_item_ordinal_unique" UNIQUE("company_id","item_id","ordinal"),
	CONSTRAINT "cte_batch_item_charges_calculation_type_check" CHECK ("calculation_type" in ('percentage_of_cargo', 'percentage_of_freight', 'fixed_amount')),
	CONSTRAINT "cte_batch_item_charges_value_coherence_check" CHECK (case when "calculation_type" = 'fixed_amount' then "rate" is null else "rate" is not null end),
	CONSTRAINT "cte_batch_item_charges_rate_check" CHECK ("rate" is null or ("rate" >= 0 and "rate" <= 1)),
	CONSTRAINT "cte_batch_item_charges_amount_check" CHECK ("amount" >= 0),
	CONSTRAINT "cte_batch_item_charges_base_amount_check" CHECK ("base_amount" >= 0),
	CONSTRAINT "cte_batch_item_charges_ordinal_check" CHECK ("ordinal" > 0),
	CONSTRAINT "cte_batch_item_charges_label_check" CHECK (length("label") > 0)
);
--> statement-breakpoint
CREATE TABLE "cte_batch_item_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"nfe_document_id" uuid NOT NULL,
	"position" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cte_batch_item_documents_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "cte_batch_item_documents_company_batch_nfe_unique" UNIQUE("company_id","batch_id","nfe_document_id"),
	CONSTRAINT "cte_batch_item_documents_company_item_position_unique" UNIQUE("company_id","item_id","position"),
	CONSTRAINT "cte_batch_item_documents_position_check" CHECK ("position" > 0)
);
--> statement-breakpoint
CREATE INDEX "cte_batch_item_documents_company_item_idx" ON "cte_batch_item_documents" ("company_id","item_id");--> statement-breakpoint
ALTER TABLE "cte_batch_item_charges" ADD CONSTRAINT "cte_batch_item_charges_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cte_batch_item_charges" ADD CONSTRAINT "cte_batch_item_charges_company_item_fk" FOREIGN KEY ("company_id","item_id") REFERENCES "cte_batch_items"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cte_batch_item_documents" ADD CONSTRAINT "cte_batch_item_documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cte_batch_item_documents" ADD CONSTRAINT "cte_batch_item_documents_company_item_fk" FOREIGN KEY ("company_id","item_id") REFERENCES "cte_batch_items"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cte_batch_item_documents" ADD CONSTRAINT "cte_batch_item_documents_company_batch_fk" FOREIGN KEY ("company_id","batch_id") REFERENCES "cte_batches"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cte_batch_item_documents" ADD CONSTRAINT "cte_batch_item_documents_company_nfe_document_fk" FOREIGN KEY ("company_id","nfe_document_id") REFERENCES "nfe_documents"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;