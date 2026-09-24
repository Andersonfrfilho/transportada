CREATE TABLE "trip_document_occurrence_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"occurrence_id" uuid NOT NULL,
	"product_code" text NOT NULL,
	"position" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_document_occurrence_products_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "trip_document_occurrence_products_unique_code" UNIQUE("company_id","occurrence_id","product_code"),
	CONSTRAINT "trip_document_occurrence_products_unique_position" UNIQUE("company_id","occurrence_id","position")
);
--> statement-breakpoint
ALTER TABLE "trip_document_occurrence_products" ADD CONSTRAINT "trip_document_occurrence_products_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_document_occurrence_products" ADD CONSTRAINT "trip_document_occurrence_products_company_occurrence_fk" FOREIGN KEY ("company_id","occurrence_id") REFERENCES "trip_document_occurrences"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;