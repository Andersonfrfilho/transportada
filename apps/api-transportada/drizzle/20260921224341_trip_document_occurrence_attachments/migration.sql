ALTER TABLE "trip_document_occurrences" ADD CONSTRAINT "trip_document_occurrences_company_id_id_unique" UNIQUE("company_id","id");--> statement-breakpoint
ALTER TABLE "stored_objects" DROP CONSTRAINT "stored_objects_purpose_check", ADD CONSTRAINT "stored_objects_purpose_check" CHECK ("purpose" in ('import_source', 'nfe_document', 'nfe_event', 'billing_document', 'cte_document', 'mdfe_document', 'nfse_document', 'aggregate_document', 'delivery_proof', 'aggregate_application_attachment', 'contractor_mail_raw', 'trip_occurrence_attachment', 'trip_occurrence_thumbnail')) NOT VALID;--> statement-breakpoint
ALTER TABLE "stored_objects" VALIDATE CONSTRAINT "stored_objects_purpose_check";--> statement-breakpoint
CREATE TABLE "trip_document_occurrence_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"occurrence_id" uuid NOT NULL,
	"stored_object_id" uuid NOT NULL,
	"thumbnail_object_id" uuid,
	"position" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_document_occurrence_attachments_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "trip_document_occurrence_attachments_unique_position" UNIQUE("company_id","occurrence_id","position"),
	CONSTRAINT "trip_document_occurrence_attachments_position_check" CHECK ("position" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "trip_document_occurrence_attachments" ADD CONSTRAINT "trip_document_occurrence_attachments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_document_occurrence_attachments" ADD CONSTRAINT "trip_document_occurrence_attachments_company_occurrence_fk" FOREIGN KEY ("company_id","occurrence_id") REFERENCES "trip_document_occurrences"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_document_occurrence_attachments" ADD CONSTRAINT "trip_document_occurrence_attachments_company_object_fk" FOREIGN KEY ("company_id","stored_object_id") REFERENCES "stored_objects"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_document_occurrence_attachments" ADD CONSTRAINT "trip_document_occurrence_attachments_company_thumbnail_fk" FOREIGN KEY ("company_id","thumbnail_object_id") REFERENCES "stored_objects"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
CREATE INDEX "trip_document_occurrence_attachments_company_object_idx" ON "trip_document_occurrence_attachments" ("company_id","stored_object_id");--> statement-breakpoint
CREATE INDEX "trip_document_occurrence_attachments_company_thumbnail_idx" ON "trip_document_occurrence_attachments" ("company_id","thumbnail_object_id") WHERE "thumbnail_object_id" is not null;--> statement-breakpoint
CREATE INDEX "trip_document_occurrence_attachments_company_occurrence_idx" ON "trip_document_occurrence_attachments" ("company_id","occurrence_id","position");
