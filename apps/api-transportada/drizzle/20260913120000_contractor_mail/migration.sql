CREATE TABLE "contractor_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"contractor_id" uuid NOT NULL,
	"email" text NOT NULL,
	"receives_occurrences" boolean DEFAULT true NOT NULL,
	"can_decide" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contractor_contacts_status_check" CHECK ("status" in ('active', 'inactive')),
	CONSTRAINT "contractor_contacts_email_check" CHECK (length(btrim("email")) > 0)
);
--> statement-breakpoint
CREATE TABLE "contractor_inbound_email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"event_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"provider_email_id" text NOT NULL,
	"event_type" text NOT NULL,
	"event_version" bigint DEFAULT 1 NOT NULL,
	"correlation_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempt" bigint DEFAULT 0 NOT NULL,
	"claim_owner" text,
	"claim_expires_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contractor_inbound_email_outbox_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "contractor_inbound_email_outbox_company_id_event_id_unique" UNIQUE("company_id","event_id"),
	CONSTRAINT "contractor_inbound_email_outbox_event_type_check" CHECK ("event_type" in ('email.received')),
	CONSTRAINT "contractor_inbound_email_outbox_provider_email_id_check" CHECK (length(btrim("provider_email_id")) > 0)
);
--> statement-breakpoint
CREATE TABLE "contractor_mail_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"actor_user_id" uuid,
	"from_address" text NOT NULL,
	"body_text" text NOT NULL,
	"raw_object_id" uuid,
	"raw_sha256" text,
	"provider_email_id" text,
	"rfc_message_id" text,
	"in_reply_to" text,
	"dkim_result" text,
	"interpretation" text,
	"downgrade_reason" text,
	"delivery_status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contractor_mail_messages_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "contractor_mail_messages_company_provider_email_unique" UNIQUE("company_id","provider_email_id"),
	CONSTRAINT "contractor_mail_messages_direction_check" CHECK ("direction" in ('inbound', 'outbound')),
	CONSTRAINT "contractor_mail_messages_inbound_actor_check" CHECK ("direction" <> 'inbound' or "actor_user_id" is null),
	CONSTRAINT "contractor_mail_messages_raw_direction_check" CHECK ("direction" = 'inbound' or ("raw_object_id" is null and "raw_sha256" is null)),
	CONSTRAINT "contractor_mail_messages_raw_pair_check" CHECK (("raw_object_id" is null) = ("raw_sha256" is null)),
	CONSTRAINT "contractor_mail_messages_raw_sha256_check" CHECK ("raw_sha256" is null or "raw_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "contractor_mail_messages_dkim_result_check" CHECK ("dkim_result" is null or "dkim_result" in ('aligned', 'not_aligned', 'unverifiable', 'absent')),
	CONSTRAINT "contractor_mail_messages_interpretation_check" CHECK ("interpretation" is null or "interpretation" in ('approve', 'reject', 'message', 'late', 'ignored_auto_reply')),
	CONSTRAINT "contractor_mail_messages_downgrade_reason_check" CHECK ("downgrade_reason" is null or "downgrade_reason" in ('keyword_absent', 'sender_not_listed', 'sender_cannot_decide', 'dkim_not_aligned', 'dkim_unverifiable', 'charge_not_submitted')),
	CONSTRAINT "contractor_mail_messages_delivery_status_check" CHECK ("delivery_status" is null or "delivery_status" in ('queued', 'sent', 'failed')),
	CONSTRAINT "contractor_mail_messages_delivery_status_direction_check" CHECK (("direction" = 'outbound') = ("delivery_status" is not null)),
	CONSTRAINT "contractor_mail_messages_body_text_check" CHECK (length("body_text") > 0),
	CONSTRAINT "contractor_mail_messages_from_address_check" CHECK (length(btrim("from_address")) > 0)
);
--> statement-breakpoint
CREATE TABLE "contractor_mail_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"event_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"event_version" bigint DEFAULT 1 NOT NULL,
	"correlation_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempt" bigint DEFAULT 0 NOT NULL,
	"claim_owner" text,
	"claim_expires_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contractor_mail_outbox_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "contractor_mail_outbox_company_id_event_id_unique" UNIQUE("company_id","event_id"),
	CONSTRAINT "contractor_mail_outbox_event_type_check" CHECK ("event_type" in ('message.send.requested'))
);
--> statement-breakpoint
CREATE TABLE "contractor_mail_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL CONSTRAINT "contractor_mail_settings_company_id_unique" UNIQUE,
	"secret_envelope" jsonb NOT NULL,
	"sender_address" text NOT NULL,
	"sender_name" text NOT NULL,
	"reply_domain" text NOT NULL,
	"webhook_id" uuid DEFAULT gen_random_uuid() NOT NULL CONSTRAINT "contractor_mail_settings_webhook_id_unique" UNIQUE,
	"last_webhook_at" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contractor_mail_settings_status_check" CHECK ("status" in ('pending', 'active', 'failed')),
	CONSTRAINT "contractor_mail_settings_sender_address_check" CHECK (length(btrim("sender_address")) > 0),
	CONSTRAINT "contractor_mail_settings_sender_name_check" CHECK (length(btrim("sender_name")) > 0),
	CONSTRAINT "contractor_mail_settings_reply_domain_check" CHECK (length(btrim("reply_domain")) > 0),
	CONSTRAINT "contractor_mail_settings_version_check" CHECK ("version" > 0)
);
--> statement-breakpoint
CREATE TABLE "contractor_mail_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"contractor_id" uuid,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"reply_token_hash" text NOT NULL CONSTRAINT "contractor_mail_threads_reply_token_hash_unique" UNIQUE,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contractor_mail_threads_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "contractor_mail_threads_company_subject_unique" UNIQUE("company_id","subject_type","subject_id"),
	CONSTRAINT "contractor_mail_threads_subject_type_check" CHECK ("subject_type" in ('stop_occurrence', 'document_occurrence', 'delivery_charge', 'setup_test')),
	CONSTRAINT "contractor_mail_threads_status_check" CHECK ("status" in ('open', 'closed')),
	CONSTRAINT "contractor_mail_threads_contractor_setup_test_check" CHECK (("subject_type" = 'setup_test') = ("contractor_id" is null)),
	CONSTRAINT "contractor_mail_threads_reply_token_hash_check" CHECK ("reply_token_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "delivery_charge_events" ADD COLUMN "decided_by_message_id" uuid;--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD COLUMN "emails_contractor" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "contractor_contacts_contractor_idx" ON "contractor_contacts" ("company_id","contractor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contractor_contacts_company_contractor_email_unique" ON "contractor_contacts" ("company_id","contractor_id",lower("email"));--> statement-breakpoint
CREATE INDEX "contractor_inbound_email_outbox_company_published_next_attempt_created_idx" ON "contractor_inbound_email_outbox" ("company_id","published_at","next_attempt_at","created_at");--> statement-breakpoint
CREATE INDEX "contractor_mail_messages_thread_idx" ON "contractor_mail_messages" ("company_id","thread_id","created_at");--> statement-breakpoint
CREATE INDEX "contractor_mail_outbox_company_published_next_attempt_created_idx" ON "contractor_mail_outbox" ("company_id","published_at","next_attempt_at","created_at");--> statement-breakpoint
ALTER TABLE "contractor_contacts" ADD CONSTRAINT "contractor_contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "contractor_contacts" ADD CONSTRAINT "contractor_contacts_contractor_fk" FOREIGN KEY ("company_id","contractor_id") REFERENCES "contractors"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "contractor_inbound_email_outbox" ADD CONSTRAINT "contractor_inbound_email_outbox_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "contractor_mail_messages" ADD CONSTRAINT "contractor_mail_messages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "contractor_mail_messages" ADD CONSTRAINT "contractor_mail_messages_thread_fk" FOREIGN KEY ("company_id","thread_id") REFERENCES "contractor_mail_threads"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "contractor_mail_messages" ADD CONSTRAINT "contractor_mail_messages_raw_object_fk" FOREIGN KEY ("company_id","raw_object_id") REFERENCES "stored_objects"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "contractor_mail_outbox" ADD CONSTRAINT "contractor_mail_outbox_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "contractor_mail_outbox" ADD CONSTRAINT "contractor_mail_outbox_company_message_fk" FOREIGN KEY ("company_id","message_id") REFERENCES "contractor_mail_messages"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "contractor_mail_settings" ADD CONSTRAINT "contractor_mail_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "contractor_mail_threads" ADD CONSTRAINT "contractor_mail_threads_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "contractor_mail_threads" ADD CONSTRAINT "contractor_mail_threads_contractor_fk" FOREIGN KEY ("company_id","contractor_id") REFERENCES "contractors"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "delivery_charge_events" ADD CONSTRAINT "delivery_charge_events_authorship_check" CHECK ("event_name" = 'suggested' or (
        (case when "actor_user_id" is not null then 1 else 0 end) +
        (case when "decided_by_token" is not null then 1 else 0 end) +
        (case when "decided_by_message_id" is not null then 1 else 0 end)
      ) = 1);
--> statement-breakpoint
-- A FK de `decided_by_message_id` não é gerada pelo drizzle-kit porque não existe no objeto
-- Drizzle de `delivery-client.schema.ts` (comentário na tabela explica o ciclo de módulos que isso
-- evitaria). A restrição real, composta por tenant, é escrita à mão aqui.
ALTER TABLE "delivery_charge_events" ADD CONSTRAINT "delivery_charge_events_decided_by_message_fk" FOREIGN KEY ("company_id","decided_by_message_id") REFERENCES "contractor_mail_messages"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;
--> statement-breakpoint
-- RF1: a lista de contatos nasce do que já existia em `contractors.report_email`. Quem recebia o
-- relatório do lote passa a receber e-mail de ocorrência também; decidir quem pode aprovar taxa por
-- e-mail (`can_decide`) é trabalho humano, feito à mão na tela nova.
INSERT INTO "contractor_contacts" ("company_id", "contractor_id", "email", "receives_occurrences", "can_decide")
SELECT "company_id", "id", "report_email", true, false
FROM "contractors"
WHERE "report_email" <> ''
ON CONFLICT DO NOTHING;