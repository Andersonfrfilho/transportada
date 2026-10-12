-- Copyright (c) 2026 Ada Technology. MIT License.
-- Spec 248 T3.1: o retorno da contratante. Aditiva: treze colunas com default constante no tipo, três
-- colunas nulas sem default na exceção da contratante, três tabelas novas e o trigger append-only dos
-- eventos. Nenhum UPDATE: nenhum tipo é ligado por nome.
CREATE TABLE "occurrence_contractor_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"occurrence_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"config" jsonb NOT NULL,
	"status" varchar(24) NOT NULL,
	"reason" varchar(40),
	"deadline_at" timestamp with time zone,
	"alert_count" smallint DEFAULT 0 NOT NULL,
	"last_alert_at" timestamp with time zone,
	"reply_message_id" uuid,
	"reply_attachment_id" uuid,
	"handled_by_user_id" uuid,
	"handled_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "occurrence_contractor_replies_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "occurrence_contractor_replies_company_occurrence_unique" UNIQUE("company_id","occurrence_id"),
	CONSTRAINT "occurrence_contractor_replies_status_check" CHECK ("status" in ('awaiting_contractor', 'overdue', 'reply_received', 'awaiting_operator', 'needs_operator', 'delivered', 'handled', 'cancelled')),
	CONSTRAINT "occurrence_contractor_replies_reason_check" CHECK ("reason" is null or ("status" = 'needs_operator' and "reason" in ('no_accepted_attachment', 'multiple_attachments'))),
	CONSTRAINT "occurrence_contractor_replies_config_check" CHECK (jsonb_typeof("config") = 'object' and jsonb_exists("config", 'version')),
	CONSTRAINT "occurrence_contractor_replies_alert_count_check" CHECK ("alert_count" >= 0),
	CONSTRAINT "occurrence_contractor_replies_handled_note_check" CHECK ("handled_note" is null or char_length("handled_note") between 1 and 500),
	CONSTRAINT "occurrence_contractor_replies_handled_shape_check" CHECK (("status" = 'handled') = ("handled_by_user_id" is not null and "handled_note" is not null)
        and ("handled_by_user_id" is not null) = ("handled_note" is not null))
);
--> statement-breakpoint
CREATE TABLE "occurrence_contractor_reply_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"reply_id" uuid NOT NULL,
	"target" varchar(32) NOT NULL,
	"trigger" varchar(16) NOT NULL,
	"status" varchar(24) NOT NULL,
	"reason" varchar(40),
	"address" text,
	"attachment_id" uuid NOT NULL,
	"driver_message_id" uuid,
	"mail_message_id" uuid,
	"actor_user_id" uuid,
	"idempotency_key" varchar(120) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "occurrence_contractor_reply_deliveries_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "occurrence_contractor_reply_deliveries_idempotency_unique" UNIQUE("company_id","idempotency_key"),
	CONSTRAINT "occurrence_contractor_reply_deliveries_target_check" CHECK ("target" in ('driver_app_chat', 'driver_whatsapp', 'note_recipient_email', 'informed_email')),
	CONSTRAINT "occurrence_contractor_reply_deliveries_trigger_check" CHECK ("trigger" in ('automatic', 'operator')),
	CONSTRAINT "occurrence_contractor_reply_deliveries_status_check" CHECK ("status" in ('queued', 'sent', 'pending_window', 'skipped', 'failed')),
	CONSTRAINT "occurrence_contractor_reply_deliveries_reason_check" CHECK ("reason" in ('driver_without_account', 'driver_unreachable', 'whatsapp_window_closed', 'note_without_recipient_email', 'attachment_too_large_for_email', 'send_failed')),
	CONSTRAINT "occurrence_contractor_reply_deliveries_address_check" CHECK ("address" is null or ("target" in ('note_recipient_email', 'informed_email') and char_length("address") between 1 and 254)),
	CONSTRAINT "occurrence_contractor_reply_deliveries_sent_at_check" CHECK (("status" = 'sent') = ("sent_at" is not null)),
	CONSTRAINT "occurrence_contractor_reply_deliveries_actor_check" CHECK (("trigger" = 'operator') = ("actor_user_id" is not null)),
	CONSTRAINT "occurrence_contractor_reply_deliveries_idempotency_key_check" CHECK (char_length("idempotency_key") >= 1)
);
--> statement-breakpoint
CREATE TABLE "occurrence_contractor_reply_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"reply_id" uuid NOT NULL,
	"delivery_id" uuid,
	"from_status" varchar(24),
	"to_status" varchar(24) NOT NULL,
	"reason" varchar(40),
	"actor_kind" varchar(16) NOT NULL,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "occurrence_contractor_reply_events_from_status_check" CHECK ("from_status" in ('awaiting_contractor', 'overdue', 'reply_received', 'awaiting_operator', 'needs_operator', 'delivered', 'handled', 'cancelled')),
	CONSTRAINT "occurrence_contractor_reply_events_to_status_check" CHECK ("to_status" in ('awaiting_contractor', 'overdue', 'reply_received', 'awaiting_operator', 'needs_operator', 'delivered', 'handled', 'cancelled')),
	CONSTRAINT "occurrence_contractor_reply_events_reason_check" CHECK ("reason" in ('no_accepted_attachment', 'multiple_attachments', 'driver_without_account', 'driver_unreachable', 'whatsapp_window_closed', 'note_without_recipient_email', 'attachment_too_large_for_email', 'send_failed')),
	CONSTRAINT "occurrence_contractor_reply_events_actor_kind_check" CHECK ("actor_kind" in ('system', 'user')),
	CONSTRAINT "occurrence_contractor_reply_events_actor_check" CHECK (("actor_kind" = 'system') = ("actor_user_id" is null))
);
--> statement-breakpoint
ALTER TABLE "company_occurrence_type_contractor_overrides" ADD COLUMN "contractor_reply_mode" varchar(32);--> statement-breakpoint
ALTER TABLE "company_occurrence_type_contractor_overrides" ADD COLUMN "contractor_reply_wait_hours" smallint;--> statement-breakpoint
ALTER TABLE "company_occurrence_type_contractor_overrides" ADD COLUMN "forward_to_note_recipient" varchar(16);--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD COLUMN "contractor_reply_mode" varchar(32) DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD COLUMN "contractor_reply_attachment_kind" varchar(16) DEFAULT 'pdf' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD COLUMN "driver_reply_channel" varchar(16) DEFAULT 'app_chat' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD COLUMN "driver_reply_window_closed_action" varchar(24) DEFAULT 'fallback_app_chat' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD COLUMN "driver_reply_template" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD COLUMN "contractor_reply_wait_hours" smallint;--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD COLUMN "contractor_reply_alert_mode" varchar(16) DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD COLUMN "contractor_reply_alert_interval_minutes" smallint DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD COLUMN "contractor_reply_alert_max_count" smallint DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD COLUMN "forward_to_note_recipient" varchar(16) DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD COLUMN "forward_to_informed_email" varchar(16) DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD COLUMN "forward_email_subject" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD COLUMN "forward_email_body" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX "occurrence_contractor_replies_waiting_deadline_idx" ON "occurrence_contractor_replies" ("company_id","deadline_at") WHERE "status" in ('awaiting_contractor', 'overdue');--> statement-breakpoint
CREATE INDEX "occurrence_contractor_reply_deliveries_reply_idx" ON "occurrence_contractor_reply_deliveries" ("company_id","reply_id");--> statement-breakpoint
CREATE INDEX "occurrence_contractor_reply_deliveries_pending_window_idx" ON "occurrence_contractor_reply_deliveries" ("company_id","status") WHERE "status" = 'pending_window';--> statement-breakpoint
CREATE INDEX "occurrence_contractor_reply_events_company_reply_created_at_idx" ON "occurrence_contractor_reply_events" ("company_id","reply_id","created_at");--> statement-breakpoint
ALTER TABLE "occurrence_contractor_replies" ADD CONSTRAINT "occurrence_contractor_replies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_contractor_replies" ADD CONSTRAINT "occurrence_contractor_replies_occurrence_fk" FOREIGN KEY ("company_id","occurrence_id") REFERENCES "trip_document_occurrences"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_contractor_replies" ADD CONSTRAINT "occurrence_contractor_replies_conversation_fk" FOREIGN KEY ("company_id","conversation_id") REFERENCES "occurrence_conversations"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_contractor_replies" ADD CONSTRAINT "occurrence_contractor_replies_reply_message_fk" FOREIGN KEY ("company_id","reply_message_id") REFERENCES "occurrence_conversation_messages"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_contractor_replies" ADD CONSTRAINT "occurrence_contractor_replies_reply_attachment_fk" FOREIGN KEY ("company_id","reply_attachment_id") REFERENCES "occurrence_conversation_attachments"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_contractor_replies" ADD CONSTRAINT "occurrence_contractor_replies_handled_by_user_fk" FOREIGN KEY ("handled_by_user_id") REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_contractor_reply_deliveries" ADD CONSTRAINT "occurrence_contractor_reply_deliveries_company_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_contractor_reply_deliveries" ADD CONSTRAINT "occurrence_contractor_reply_deliveries_reply_fk" FOREIGN KEY ("company_id","reply_id") REFERENCES "occurrence_contractor_replies"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_contractor_reply_deliveries" ADD CONSTRAINT "occurrence_contractor_reply_deliveries_attachment_fk" FOREIGN KEY ("company_id","attachment_id") REFERENCES "occurrence_conversation_attachments"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_contractor_reply_deliveries" ADD CONSTRAINT "occurrence_contractor_reply_deliveries_driver_message_fk" FOREIGN KEY ("company_id","driver_message_id") REFERENCES "occurrence_conversation_messages"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_contractor_reply_deliveries" ADD CONSTRAINT "occurrence_contractor_reply_deliveries_actor_user_fk" FOREIGN KEY ("actor_user_id") REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_contractor_reply_events" ADD CONSTRAINT "occurrence_contractor_reply_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_contractor_reply_events" ADD CONSTRAINT "occurrence_contractor_reply_events_reply_fk" FOREIGN KEY ("company_id","reply_id") REFERENCES "occurrence_contractor_replies"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_contractor_reply_events" ADD CONSTRAINT "occurrence_contractor_reply_events_delivery_fk" FOREIGN KEY ("company_id","delivery_id") REFERENCES "occurrence_contractor_reply_deliveries"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_contractor_reply_events" ADD CONSTRAINT "occurrence_contractor_reply_events_actor_user_fk" FOREIGN KEY ("actor_user_id") REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_occurrence_type_contractor_overrides" ADD CONSTRAINT "occurrence_type_contractor_overrides_reply_mode_check" CHECK ("contractor_reply_mode" in ('off', 'forward_after_approval', 'forward_automatic'));--> statement-breakpoint
ALTER TABLE "company_occurrence_type_contractor_overrides" ADD CONSTRAINT "occurrence_type_contractor_overrides_reply_wait_hours_check" CHECK ("contractor_reply_wait_hours" between 1 and 168);--> statement-breakpoint
ALTER TABLE "company_occurrence_type_contractor_overrides" ADD CONSTRAINT "occurrence_type_contractor_overrides_forward_note_check" CHECK ("forward_to_note_recipient" in ('off', 'manual', 'automatic'));--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_contractor_reply_mode_check" CHECK ("contractor_reply_mode" in ('off', 'forward_after_approval', 'forward_automatic'));--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_contractor_reply_attachment_kind_check" CHECK ("contractor_reply_attachment_kind" in ('pdf', 'pdf_or_image'));--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_driver_reply_channel_check" CHECK ("driver_reply_channel" in ('app_chat', 'whatsapp', 'both'));--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_driver_reply_window_action_check" CHECK ("driver_reply_window_closed_action" in ('fallback_app_chat', 'wait_for_driver'));--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_driver_reply_template_check" CHECK (char_length("driver_reply_template") <= 1000);--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_contractor_reply_wait_hours_check" CHECK ("contractor_reply_wait_hours" between 1 and 168);--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_contractor_reply_alert_mode_check" CHECK ("contractor_reply_alert_mode" in ('off', 'alert_operator'));--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_contractor_reply_alert_interval_check" CHECK ("contractor_reply_alert_interval_minutes" between 15 and 1440);--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_contractor_reply_alert_max_count_check" CHECK ("contractor_reply_alert_max_count" between 1 and 96);--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_forward_to_note_recipient_check" CHECK ("forward_to_note_recipient" in ('off', 'manual', 'automatic'));--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_forward_to_informed_email_check" CHECK ("forward_to_informed_email" in ('off', 'manual'));--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_forward_email_subject_check" CHECK (char_length("forward_email_subject") <= 200);--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_forward_email_body_check" CHECK (char_length("forward_email_body") <= 4000);--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_contractor_reply_requires_mail_check" CHECK ("contractor_reply_mode" = 'off' or ("emails_contractor" and btrim("driver_reply_template") <> ''));--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_contractor_reply_alert_wait_check" CHECK ("contractor_reply_alert_mode" = 'off' or "contractor_reply_wait_hours" is not null);--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_forward_automatic_needs_reply_check" CHECK ("forward_to_note_recipient" <> 'automatic' or "contractor_reply_mode" <> 'off');--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_forward_needs_text_check" CHECK (("forward_to_note_recipient" = 'off' and "forward_to_informed_email" = 'off') or (btrim("forward_email_subject") <> '' and btrim("forward_email_body") <> ''));--> statement-breakpoint
CREATE FUNCTION "reject_occurrence_contractor_reply_events_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'occurrence_contractor_reply_events is append-only' USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "occurrence_contractor_reply_events_append_only_trigger"
BEFORE UPDATE OR DELETE ON "occurrence_contractor_reply_events"
FOR EACH ROW
EXECUTE FUNCTION "reject_occurrence_contractor_reply_events_mutation"();
