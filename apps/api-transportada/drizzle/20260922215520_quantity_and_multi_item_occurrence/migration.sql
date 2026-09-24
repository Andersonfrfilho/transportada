ALTER TABLE "company_occurrence_types" ADD COLUMN "allows_multiple_items" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_document_occurrence_products" ADD COLUMN "quantity" numeric(12,3);--> statement-breakpoint
ALTER TABLE "trip_document_occurrence_products" ADD COLUMN "quantity_unit" varchar(8);--> statement-breakpoint
ALTER TABLE "trip_document_occurrence_products" ADD CONSTRAINT "trip_document_occurrence_products_quantity_presence_check" CHECK (("quantity" is null) = ("quantity_unit" is null));--> statement-breakpoint
ALTER TABLE "trip_document_occurrence_products" ADD CONSTRAINT "trip_document_occurrence_products_quantity_positive_check" CHECK ("quantity" is null or "quantity" > 0);--> statement-breakpoint
ALTER TABLE "trip_document_occurrence_products" ADD CONSTRAINT "trip_document_occurrence_products_quantity_unit_check" CHECK ("quantity_unit" is null or "quantity_unit" in ('box', 'unit'));