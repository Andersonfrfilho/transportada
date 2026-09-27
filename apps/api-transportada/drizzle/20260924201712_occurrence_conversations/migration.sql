CREATE TABLE "occurrence_conversation_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"stored_object_id" uuid NOT NULL,
	"sha256" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"content_type" text NOT NULL,
	"file_name" text DEFAULT '' NOT NULL,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "occurrence_conversation_attachments_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "occurrence_conversation_attachments_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "occurrence_conversation_attachments_size_check" CHECK ("size_bytes" > 0),
	CONSTRAINT "occurrence_conversation_attachments_duration_check" CHECK ("duration_ms" is null or "duration_ms" > 0)
);
--> statement-breakpoint
CREATE TABLE "occurrence_conversation_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"direction" text NOT NULL,
	"author_user_id" uuid,
	"contractor_contact_id" uuid,
	"driver_user_id" uuid,
	"sender_address" text,
	"body_text" text DEFAULT '' NOT NULL,
	"status" text,
	"status_times" jsonb DEFAULT '{}' NOT NULL,
	"mail_message_id" uuid,
	"provider_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "occurrence_conversation_messages_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "occurrence_conversation_messages_provider_message_unique" UNIQUE("company_id","channel","provider_message_id"),
	CONSTRAINT "occurrence_conversation_messages_channel_check" CHECK ("channel" in ('email', 'whatsapp', 'app', 'portal')),
	CONSTRAINT "occurrence_conversation_messages_direction_check" CHECK ("direction" in ('inbound', 'outbound')),
	CONSTRAINT "occurrence_conversation_messages_author_check" CHECK (("direction" = 'outbound' and "author_user_id" is not null and "driver_user_id" is null and "sender_address" is null and "contractor_contact_id" is null)
        or ("direction" = 'inbound' and num_nonnulls("author_user_id", "driver_user_id", "sender_address") = 1
          and ("author_user_id" is null or "channel" = 'portal')
          and ("sender_address" is null or "channel" in ('email', 'whatsapp')))),
	CONSTRAINT "occurrence_conversation_messages_status_check" CHECK ("status" is null or "status" in ('queued', 'sent', 'delivered', 'read', 'failed', 'bounced')),
	CONSTRAINT "occurrence_conversation_messages_status_direction_check" CHECK (("direction" = 'outbound') = ("status" is not null)),
	CONSTRAINT "occurrence_conversation_messages_email_never_read_check" CHECK ("channel" <> 'email' or "status" is null or "status" <> 'read'),
	CONSTRAINT "occurrence_conversation_messages_portal_status_check" CHECK ("channel" <> 'portal' or "status" is null or "status" in ('delivered', 'read')),
	CONSTRAINT "occurrence_conversation_messages_body_length_check" CHECK (length("body_text") <= 8000)
);
--> statement-breakpoint
CREATE TABLE "occurrence_conversation_reads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"last_read_message_id" uuid NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "occurrence_conversation_reads_user_unique" UNIQUE("company_id","conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "occurrence_conversation_unassigned" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"contractor_contact_id" uuid,
	"sender_address" text NOT NULL,
	"body_text" text DEFAULT '' NOT NULL,
	"provider_message_id" text,
	"mail_message_id" uuid,
	"received_at" timestamp with time zone NOT NULL,
	"assigned_message_id" uuid,
	"assigned_at" timestamp with time zone,
	"assigned_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "occurrence_conversation_unassigned_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "occurrence_conversation_unassigned_provider_message_unique" UNIQUE("company_id","channel","provider_message_id"),
	CONSTRAINT "occurrence_conversation_unassigned_channel_check" CHECK ("channel" in ('email', 'whatsapp')),
	CONSTRAINT "occurrence_conversation_unassigned_assignment_check" CHECK (num_nonnulls("assigned_message_id", "assigned_at", "assigned_by_user_id") in (0, 3))
);
--> statement-breakpoint
CREATE TABLE "occurrence_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"occurrence_kind" text NOT NULL,
	"occurrence_id" uuid NOT NULL,
	"participant" text NOT NULL,
	"contractor_id" uuid,
	"driver_user_id" uuid,
	"public_ref" text CONSTRAINT "occurrence_conversations_public_ref_unique" UNIQUE,
	"status" text DEFAULT 'open' NOT NULL,
	"default_channel" text,
	"window_expiry_notice_sent_for" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "occurrence_conversations_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "occurrence_conversations_occurrence_participant_unique" UNIQUE("company_id","occurrence_kind","occurrence_id","participant"),
	CONSTRAINT "occurrence_conversations_occurrence_kind_check" CHECK ("occurrence_kind" in ('stop', 'document')),
	CONSTRAINT "occurrence_conversations_participant_check" CHECK ("participant" in ('contractor', 'driver')),
	CONSTRAINT "occurrence_conversations_status_check" CHECK ("status" in ('open', 'closed')),
	CONSTRAINT "occurrence_conversations_default_channel_check" CHECK ("default_channel" is null or "default_channel" in ('email', 'whatsapp', 'app', 'portal')),
	CONSTRAINT "occurrence_conversations_participant_shape_check" CHECK (("participant" = 'contractor' and "contractor_id" is not null and "public_ref" is not null and "driver_user_id" is null)
        or ("participant" = 'driver' and "driver_user_id" is not null and "contractor_id" is null and "public_ref" is null)),
	CONSTRAINT "occurrence_conversations_public_ref_check" CHECK ("public_ref" is null or "public_ref" ~ '^[A-Za-z0-9_-]{22,64}$')
);
--> statement-breakpoint
ALTER TABLE "contractor_contacts" ADD CONSTRAINT "contractor_contacts_company_id_id_unique" UNIQUE("company_id","id");--> statement-breakpoint
CREATE INDEX "occurrence_conversation_attachments_message_idx" ON "occurrence_conversation_attachments" ("company_id","message_id");--> statement-breakpoint
CREATE INDEX "occurrence_conversation_messages_conversation_created_idx" ON "occurrence_conversation_messages" ("company_id","conversation_id","created_at","id");--> statement-breakpoint
CREATE INDEX "occurrence_conversation_unassigned_open_idx" ON "occurrence_conversation_unassigned" ("company_id","received_at") WHERE "assigned_message_id" is null;--> statement-breakpoint
ALTER TABLE "occurrence_conversation_attachments" ADD CONSTRAINT "occurrence_conversation_attachments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_conversation_attachments" ADD CONSTRAINT "occurrence_conversation_attachments_message_fk" FOREIGN KEY ("company_id","message_id") REFERENCES "occurrence_conversation_messages"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_conversation_attachments" ADD CONSTRAINT "occurrence_conversation_attachments_stored_object_fk" FOREIGN KEY ("company_id","stored_object_id") REFERENCES "stored_objects"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_conversation_messages" ADD CONSTRAINT "occurrence_conversation_messages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_conversation_messages" ADD CONSTRAINT "occurrence_conversation_messages_conversation_fk" FOREIGN KEY ("company_id","conversation_id") REFERENCES "occurrence_conversations"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_conversation_messages" ADD CONSTRAINT "occurrence_conversation_messages_contractor_contact_fk" FOREIGN KEY ("company_id","contractor_contact_id") REFERENCES "contractor_contacts"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_conversation_messages" ADD CONSTRAINT "occurrence_conversation_messages_mail_message_fk" FOREIGN KEY ("company_id","mail_message_id") REFERENCES "contractor_mail_messages"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_conversation_messages" ADD CONSTRAINT "occurrence_conversation_messages_author_user_fk" FOREIGN KEY ("author_user_id") REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_conversation_messages" ADD CONSTRAINT "occurrence_conversation_messages_driver_user_fk" FOREIGN KEY ("driver_user_id") REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_conversation_reads" ADD CONSTRAINT "occurrence_conversation_reads_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_conversation_reads" ADD CONSTRAINT "occurrence_conversation_reads_conversation_fk" FOREIGN KEY ("company_id","conversation_id") REFERENCES "occurrence_conversations"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_conversation_reads" ADD CONSTRAINT "occurrence_conversation_reads_message_fk" FOREIGN KEY ("company_id","last_read_message_id") REFERENCES "occurrence_conversation_messages"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_conversation_reads" ADD CONSTRAINT "occurrence_conversation_reads_user_fk" FOREIGN KEY ("user_id") REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_conversation_unassigned" ADD CONSTRAINT "occurrence_conversation_unassigned_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_conversation_unassigned" ADD CONSTRAINT "occurrence_conversation_unassigned_contractor_contact_fk" FOREIGN KEY ("company_id","contractor_contact_id") REFERENCES "contractor_contacts"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_conversation_unassigned" ADD CONSTRAINT "occurrence_conversation_unassigned_mail_message_fk" FOREIGN KEY ("company_id","mail_message_id") REFERENCES "contractor_mail_messages"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_conversation_unassigned" ADD CONSTRAINT "occurrence_conversation_unassigned_assigned_message_fk" FOREIGN KEY ("company_id","assigned_message_id") REFERENCES "occurrence_conversation_messages"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_conversation_unassigned" ADD CONSTRAINT "occurrence_conversation_unassigned_assigned_by_user_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_conversations" ADD CONSTRAINT "occurrence_conversations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_conversations" ADD CONSTRAINT "occurrence_conversations_contractor_fk" FOREIGN KEY ("company_id","contractor_id") REFERENCES "contractors"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_conversations" ADD CONSTRAINT "occurrence_conversations_driver_user_fk" FOREIGN KEY ("driver_user_id") REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;