CREATE TABLE "aggregate_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"tax_id" varchar(14) NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"rejection_reason" text DEFAULT '' NOT NULL,
	"stored_object_id" uuid NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aggregate_documents_company_tax_id_type_unique" UNIQUE("company_id","tax_id","type"),
	CONSTRAINT "aggregate_documents_type_check" CHECK ("type" in ('cnh', 'crlv')),
	CONSTRAINT "aggregate_documents_status_check" CHECK ("status" in ('pending', 'approved', 'rejected')),
	CONSTRAINT "aggregate_documents_review_check" CHECK (("reviewed_by" is null) = ("reviewed_at" is null)),
	CONSTRAINT "aggregate_documents_rejection_reason_check" CHECK (("status" = 'rejected') = (length("rejection_reason") > 0))
);
--> statement-breakpoint
ALTER TABLE "aggregate_documents" ADD CONSTRAINT "aggregate_documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "aggregate_documents" ADD CONSTRAINT "aggregate_documents_company_stored_object_fk" FOREIGN KEY ("company_id","stored_object_id") REFERENCES "stored_objects"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "stored_objects" DROP CONSTRAINT "stored_objects_purpose_check", ADD CONSTRAINT "stored_objects_purpose_check" CHECK ("purpose" in ('import_source', 'nfe_document', 'nfe_event', 'billing_document', 'cte_document', 'mdfe_document', 'nfse_document', 'aggregate_document'));