CREATE TABLE "occurrence_conversation_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"occurrence_kind" text NOT NULL,
	"occurrence_id" uuid NOT NULL,
	"participant" text NOT NULL,
	"channel" text NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"bucket" text NOT NULL,
	"object_key" text NOT NULL CONSTRAINT "occurrence_conversation_uploads_object_key_unique" UNIQUE,
	"declared_content_type" text NOT NULL,
	"declared_size_bytes" integer NOT NULL,
	"file_name" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attached_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "occurrence_conversation_uploads_status_check" CHECK ("status" in ('pending', 'attached', 'expired')),
	CONSTRAINT "occurrence_conversation_uploads_channel_check" CHECK ("channel" in ('email', 'whatsapp', 'app', 'portal')),
	CONSTRAINT "occurrence_conversation_uploads_participant_check" CHECK ("participant" in ('contractor', 'driver')),
	CONSTRAINT "occurrence_conversation_uploads_occurrence_kind_check" CHECK ("occurrence_kind" in ('stop', 'document')),
	CONSTRAINT "occurrence_conversation_uploads_size_check" CHECK ("declared_size_bytes" > 0),
	CONSTRAINT "occurrence_conversation_uploads_file_name_check" CHECK (char_length("file_name") <= 200),
	CONSTRAINT "occurrence_conversation_uploads_attached_check" CHECK (("status" = 'attached') = ("attached_at" is not null))
);
--> statement-breakpoint
CREATE INDEX "occurrence_conversation_uploads_status_expires_idx" ON "occurrence_conversation_uploads" ("status","expires_at");--> statement-breakpoint
ALTER TABLE "occurrence_conversation_uploads" ADD CONSTRAINT "occurrence_conversation_uploads_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_conversation_uploads" ADD CONSTRAINT "occurrence_conversation_uploads_requested_by_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "stored_objects" DROP CONSTRAINT "stored_objects_purpose_check", ADD CONSTRAINT "stored_objects_purpose_check" CHECK ("purpose" in ('import_source', 'nfe_document', 'nfe_event', 'billing_document', 'cte_document', 'mdfe_document', 'nfse_document', 'aggregate_document', 'delivery_proof', 'aggregate_application_attachment', 'contractor_mail_raw', 'trip_occurrence_attachment', 'trip_occurrence_thumbnail', 'extra_charge_batch_statement', 'occurrence_conversation_attachment'));