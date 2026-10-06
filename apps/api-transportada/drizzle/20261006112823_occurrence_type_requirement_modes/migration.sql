ALTER TABLE "company_occurrence_type_contractor_overrides" ADD COLUMN "note_mode" varchar(16);--> statement-breakpoint
ALTER TABLE "company_occurrence_type_contractor_overrides" ADD COLUMN "signature_mode" varchar(16);--> statement-breakpoint
ALTER TABLE "company_occurrence_type_recipient_overrides" ADD COLUMN "note_mode" varchar(16);--> statement-breakpoint
ALTER TABLE "company_occurrence_type_recipient_overrides" ADD COLUMN "signature_mode" varchar(16);--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD COLUMN "note_mode" varchar(16) DEFAULT 'optional' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD COLUMN "signature_mode" varchar(16) DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" ADD COLUMN "signature_object_id" uuid;--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD COLUMN "signature_object_id" uuid;--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" ADD CONSTRAINT "trip_document_occurrences_company_signature_object_fk" FOREIGN KEY ("company_id","signature_object_id") REFERENCES "stored_objects"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD CONSTRAINT "trip_stop_occurrences_company_signature_object_fk" FOREIGN KEY ("company_id","signature_object_id") REFERENCES "stored_objects"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_occurrence_type_contractor_overrides" ADD CONSTRAINT "occurrence_type_contractor_overrides_note_mode_check" CHECK ("note_mode" in ('required', 'optional', 'off'));--> statement-breakpoint
ALTER TABLE "company_occurrence_type_contractor_overrides" ADD CONSTRAINT "occurrence_type_contractor_overrides_signature_mode_check" CHECK ("signature_mode" in ('required', 'optional', 'off'));--> statement-breakpoint
ALTER TABLE "company_occurrence_type_recipient_overrides" ADD CONSTRAINT "occurrence_type_recipient_overrides_note_mode_check" CHECK ("note_mode" in ('required', 'optional', 'off'));--> statement-breakpoint
ALTER TABLE "company_occurrence_type_recipient_overrides" ADD CONSTRAINT "occurrence_type_recipient_overrides_signature_mode_check" CHECK ("signature_mode" in ('required', 'optional', 'off'));--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_note_mode_check" CHECK ("note_mode" in ('required', 'optional', 'off'));--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_signature_mode_check" CHECK ("signature_mode" in ('required', 'optional', 'off'));