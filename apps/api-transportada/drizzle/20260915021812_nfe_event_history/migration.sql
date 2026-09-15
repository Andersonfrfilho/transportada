CREATE TABLE "nfe_document_status_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"status_before" varchar(16) NOT NULL,
	"status_after" varchar(16) NOT NULL,
	"cause" varchar(16) NOT NULL,
	"event_id" uuid,
	"import_id" uuid,
	"origin" varchar(16),
	"actor_user_id" uuid,
	"requested_by_user_id" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nfe_document_status_changes_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "nfe_document_status_changes_document_target_unique" UNIQUE("company_id","document_id","status_after"),
	CONSTRAINT "nfe_document_status_changes_status_check" CHECK ("status_before" in ('authorized', 'cancelled', 'denied', 'unsigned') and "status_after" in ('authorized', 'cancelled', 'denied', 'unsigned')),
	CONSTRAINT "nfe_document_status_changes_transition_check" CHECK (("status_before", "status_after") in (('authorized', 'cancelled'), ('unsigned', 'cancelled'), ('unsigned', 'denied'))),
	CONSTRAINT "nfe_document_status_changes_cause_check" CHECK ("cause" in ('event', 'summary', 'document_insert')),
	CONSTRAINT "nfe_document_status_changes_event_presence_check" CHECK (("cause" = 'summary') = ("event_id" is null)),
	CONSTRAINT "nfe_document_status_changes_origin_check" CHECK ("origin" is null or "origin" in ('manual', 'automatic')),
	CONSTRAINT "nfe_document_status_changes_origin_actor_check" CHECK (("origin" is null and "actor_user_id" is null and "requested_by_user_id" is null) or ("origin" = 'manual' and "actor_user_id" is not null and "requested_by_user_id" is null) or ("origin" = 'automatic' and "actor_user_id" is null)),
	CONSTRAINT "nfe_document_status_changes_origin_import_check" CHECK (("origin" is null) = ("import_id" is null))
);
--> statement-breakpoint
ALTER TABLE "nfe_events" ADD COLUMN "status_code" varchar(3);--> statement-breakpoint
ALTER TABLE "nfe_events" ADD COLUMN "protocol" varchar(20);--> statement-breakpoint
ALTER TABLE "nfe_events" ADD COLUMN "correction_text" text;--> statement-breakpoint
ALTER TABLE "nfe_events" ADD COLUMN "import_id" uuid;--> statement-breakpoint
ALTER TABLE "nfe_events" ADD COLUMN "origin" varchar(16);--> statement-breakpoint
ALTER TABLE "nfe_events" ADD COLUMN "actor_user_id" uuid;--> statement-breakpoint
ALTER TABLE "nfe_events" ADD COLUMN "requested_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "nfe_events" ADD COLUMN "document_status_before" varchar(16);--> statement-breakpoint
ALTER TABLE "nfe_events" ADD COLUMN "document_status_after" varchar(16);--> statement-breakpoint
CREATE INDEX "nfe_document_status_changes_company_document_changed_id_idx" ON "nfe_document_status_changes" ("company_id","document_id","changed_at" DESC,"id" DESC);--> statement-breakpoint
ALTER TABLE "nfe_document_status_changes" ADD CONSTRAINT "nfe_document_status_changes_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfe_document_status_changes" ADD CONSTRAINT "nfe_document_status_changes_company_document_fk" FOREIGN KEY ("company_id","document_id") REFERENCES "nfe_documents"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfe_document_status_changes" ADD CONSTRAINT "nfe_document_status_changes_company_event_fk" FOREIGN KEY ("company_id","event_id") REFERENCES "nfe_events"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfe_document_status_changes" ADD CONSTRAINT "nfe_document_status_changes_company_import_fk" FOREIGN KEY ("company_id","import_id") REFERENCES "nfe_imports"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfe_events" ADD CONSTRAINT "nfe_events_company_import_fk" FOREIGN KEY ("company_id","import_id") REFERENCES "nfe_imports"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfe_events" ADD CONSTRAINT "nfe_events_status_code_check" CHECK ("status_code" is null or "status_code" ~ '^[0-9]{3}$');--> statement-breakpoint
ALTER TABLE "nfe_events" ADD CONSTRAINT "nfe_events_protocol_check" CHECK ("protocol" is null or "status_code" is not null);--> statement-breakpoint
ALTER TABLE "nfe_events" ADD CONSTRAINT "nfe_events_correction_text_check" CHECK ("correction_text" is null or ("event_type" = '110110' and char_length("correction_text") between 1 and 1000));--> statement-breakpoint
ALTER TABLE "nfe_events" ADD CONSTRAINT "nfe_events_origin_check" CHECK ("origin" is null or "origin" in ('manual', 'automatic'));--> statement-breakpoint
ALTER TABLE "nfe_events" ADD CONSTRAINT "nfe_events_origin_actor_check" CHECK (("origin" is null and "actor_user_id" is null and "requested_by_user_id" is null) or ("origin" = 'manual' and "actor_user_id" is not null and "requested_by_user_id" is null) or ("origin" = 'automatic' and "actor_user_id" is null));--> statement-breakpoint
ALTER TABLE "nfe_events" ADD CONSTRAINT "nfe_events_origin_import_check" CHECK (("origin" is null) = ("import_id" is null));--> statement-breakpoint
ALTER TABLE "nfe_events" ADD CONSTRAINT "nfe_events_document_status_check" CHECK (("document_status_before" is null or "document_status_before" in ('authorized', 'cancelled', 'denied', 'unsigned')) and ("document_status_after" is null or "document_status_after" in ('authorized', 'cancelled', 'denied', 'unsigned')));--> statement-breakpoint
ALTER TABLE "nfe_events" ADD CONSTRAINT "nfe_events_document_status_pair_check" CHECK (("document_status_before" is null) = ("document_status_after" is null));--> statement-breakpoint
ALTER TABLE "nfe_events" ADD CONSTRAINT "nfe_events_document_status_transition_check" CHECK ("document_status_before" is null or "document_status_before" = "document_status_after" or ("document_status_before", "document_status_after") in (('authorized', 'cancelled'), ('unsigned', 'cancelled'), ('unsigned', 'denied')));