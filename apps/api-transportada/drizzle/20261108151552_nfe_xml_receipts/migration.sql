CREATE TABLE "nfe_xml_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"provider_message_id" text NOT NULL,
	"sender" text NOT NULL,
	"requested_by_user_id" uuid,
	"reply_to" text,
	"media" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"reject_reason" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"files_count" integer DEFAULT 0 NOT NULL,
	"import_id" uuid,
	"last_error_code" text,
	"acknowledged_at" timestamp with time zone,
	"summary_sent_at" timestamp with time zone,
	"summary_attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nfe_xml_receipts_company_channel_message_unique" UNIQUE("company_id","channel","provider_message_id"),
	CONSTRAINT "nfe_xml_receipts_channel_check" CHECK ("channel" in ('email', 'whatsapp')),
	CONSTRAINT "nfe_xml_receipts_status_check" CHECK ("status" in ('pending', 'processing', 'imported', 'rejected', 'failed')),
	CONSTRAINT "nfe_xml_receipts_sender_check" CHECK (char_length("sender") between 3 and 254),
	CONSTRAINT "nfe_xml_receipts_attempts_check" CHECK ("attempts" >= 0 and "files_count" >= 0 and "summary_attempts" >= 0),
	CONSTRAINT "nfe_xml_receipts_imported_import_check" CHECK ("status" <> 'imported' or "import_id" is not null),
	CONSTRAINT "nfe_xml_receipts_rejected_reason_check" CHECK ("status" <> 'rejected' or "reject_reason" is not null)
);
--> statement-breakpoint
CREATE INDEX "nfe_xml_receipts_pending_idx" ON "nfe_xml_receipts" ("status","next_attempt_at") WHERE "status" in ('pending', 'processing');--> statement-breakpoint
CREATE INDEX "nfe_xml_receipts_summary_pending_idx" ON "nfe_xml_receipts" ("company_id","status") WHERE "summary_sent_at" is null and "status" in ('imported', 'rejected', 'failed');--> statement-breakpoint
ALTER TABLE "nfe_xml_receipts" ADD CONSTRAINT "nfe_xml_receipts_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfe_xml_receipts" ADD CONSTRAINT "nfe_xml_receipts_company_import_fk" FOREIGN KEY ("company_id","import_id") REFERENCES "nfe_imports"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;