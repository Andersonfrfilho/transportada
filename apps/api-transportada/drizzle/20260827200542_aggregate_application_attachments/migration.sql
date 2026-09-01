CREATE TABLE "aggregate_application_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"draft_id" uuid DEFAULT gen_random_uuid() NOT NULL CONSTRAINT "aggregate_application_attachments_draft_id_unique" UNIQUE,
	"application_id" uuid,
	"type" text NOT NULL,
	"stored_object_id" uuid NOT NULL,
	"extracted_fields" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"rejection_reason" text DEFAULT '' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aggregate_application_attachments_type_check" CHECK ("type" in ('ccmei', 'cnh', 'crlv', 'other')),
	CONSTRAINT "aggregate_application_attachments_status_check" CHECK ("status" in ('pending', 'approved', 'rejected')),
	CONSTRAINT "aggregate_application_attachments_review_check" CHECK (("reviewed_by" is null) = ("reviewed_at" is null)),
	CONSTRAINT "aggregate_application_attachments_rejection_reason_check" CHECK (("status" = 'rejected') = (length("rejection_reason") > 0))
);
--> statement-breakpoint
ALTER TABLE "aggregate_application_attachments" ADD CONSTRAINT "aggregate_application_attachments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "aggregate_application_attachments" ADD CONSTRAINT "aggregate_application_attachments_company_stored_object_fk" FOREIGN KEY ("company_id","stored_object_id") REFERENCES "stored_objects"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "aggregate_application_attachments" ADD CONSTRAINT "aggregate_application_attachments_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "aggregate_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;