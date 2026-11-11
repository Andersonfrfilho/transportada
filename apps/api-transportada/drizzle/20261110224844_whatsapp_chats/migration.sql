-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Spec 319 T2 (RF1, RF4, RF6): a caixa de conversas do WhatsApp, aditiva. Tabelas novas `whatsapp_chats` (estado
-- bot/atendente por JID, assumir atômico, vencimento) e `whatsapp_chat_messages` (histórico, deduplicado pelo id do
-- provedor), e o prazo de devolução por empresa em `whatsapp_evolution_settings` (padrão 30 min). Nada de ocorrência
-- é tocado (RF8).
CREATE TABLE "whatsapp_chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"chat_id" uuid NOT NULL,
	"direction" varchar(8) NOT NULL,
	"author" varchar(8) NOT NULL,
	"author_user_id" uuid,
	"sender_phone" varchar(15),
	"content_kind" varchar(8) DEFAULT 'text' NOT NULL,
	"body_text" text DEFAULT '' NOT NULL,
	"provider_message_id" varchar(128),
	"status" varchar(12),
	"failure_reason" varchar(24),
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_chat_messages_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "whatsapp_chat_messages_direction_check" CHECK ("direction" in ('inbound', 'outbound')),
	CONSTRAINT "whatsapp_chat_messages_author_check" CHECK ("author" in ('driver', 'member', 'bot', 'operator', 'phone')),
	CONSTRAINT "whatsapp_chat_messages_content_kind_check" CHECK ("content_kind" in ('text', 'image', 'audio', 'video', 'document', 'sticker', 'other')),
	CONSTRAINT "whatsapp_chat_messages_status_check" CHECK ("status" is null or "status" in ('queued', 'sent', 'delivered', 'read', 'failed')),
	CONSTRAINT "whatsapp_chat_messages_failure_reason_check" CHECK ("failure_reason" is null or "failure_reason" in ('disconnected', 'number_not_found', 'failed')),
	CONSTRAINT "whatsapp_chat_messages_author_direction_check" CHECK (("direction" = 'inbound' and "author" in ('driver', 'member') and "status" is null)
        or ("direction" = 'outbound' and "author" in ('bot', 'operator', 'phone') and "status" is not null)),
	CONSTRAINT "whatsapp_chat_messages_author_user_check" CHECK (("author" = 'operator') = ("author_user_id" is not null)
        and ("sender_phone" is null or ("direction" = 'inbound' and "sender_phone" ~ '^[0-9]{8,15}$'))),
	CONSTRAINT "whatsapp_chat_messages_failure_check" CHECK (("status" = 'failed') = ("failure_reason" is not null)),
	CONSTRAINT "whatsapp_chat_messages_provider_id_check" CHECK ("provider_message_id" is not null or "status" is null or "status" in ('queued', 'failed')),
	CONSTRAINT "whatsapp_chat_messages_operator_text_check" CHECK ("author" <> 'operator' or char_length("body_text") between 1 and 4000)
);
--> statement-breakpoint
CREATE TABLE "whatsapp_chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"chat_jid" varchar(64) NOT NULL,
	"kind" varchar(8) NOT NULL,
	"state" varchar(8) DEFAULT 'bot' NOT NULL,
	"taken_over_by_user_id" uuid,
	"taken_over_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"released_by_user_id" uuid,
	"release_reason" varchar(8),
	"last_message_at" timestamp with time zone,
	"last_inbound_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_chats_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "whatsapp_chats_company_jid_unique" UNIQUE("company_id","chat_jid"),
	CONSTRAINT "whatsapp_chats_kind_check" CHECK ("kind" in ('group', 'direct')),
	CONSTRAINT "whatsapp_chats_state_check" CHECK ("state" in ('bot', 'operator')),
	CONSTRAINT "whatsapp_chats_release_reason_check" CHECK ("release_reason" is null or "release_reason" in ('manual', 'expired')),
	CONSTRAINT "whatsapp_chats_jid_check" CHECK (("kind" = 'group' and "chat_jid" ~ '^[0-9]+(-[0-9]+)?@g\.us$')
        or ("kind" = 'direct' and "chat_jid" ~ '^[0-9]{8,15}@s\.whatsapp\.net$')),
	CONSTRAINT "whatsapp_chats_takeover_check" CHECK (("state" = 'operator') = ("taken_over_by_user_id" is not null)
        and ("state" = 'operator') = ("taken_over_at" is not null)
        and ("state" = 'operator') = ("expires_at" is not null)
        and ("expires_at" is null or "expires_at" > "taken_over_at")),
	CONSTRAINT "whatsapp_chats_release_check" CHECK (("release_reason" is null) = ("released_at" is null)
        and ("release_reason" is null or "state" = 'bot')
        and ("released_by_user_id" is null or "release_reason" = 'manual'))
);
--> statement-breakpoint
ALTER TABLE "whatsapp_evolution_settings" ADD COLUMN "chat_takeover_timeout_seconds" integer DEFAULT 1800 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_chat_messages_company_provider_unique" ON "whatsapp_chat_messages" ("company_id","provider_message_id") WHERE "provider_message_id" is not null;--> statement-breakpoint
CREATE INDEX "whatsapp_chat_messages_company_chat_occurred_idx" ON "whatsapp_chat_messages" ("company_id","chat_id","occurred_at");--> statement-breakpoint
CREATE INDEX "whatsapp_chats_company_last_message_idx" ON "whatsapp_chats" ("company_id","last_message_at");--> statement-breakpoint
CREATE INDEX "whatsapp_chats_operator_expires_idx" ON "whatsapp_chats" ("expires_at") WHERE "state" = 'operator';--> statement-breakpoint
ALTER TABLE "whatsapp_chat_messages" ADD CONSTRAINT "whatsapp_chat_messages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "whatsapp_chat_messages" ADD CONSTRAINT "whatsapp_chat_messages_company_chat_fk" FOREIGN KEY ("company_id","chat_id") REFERENCES "whatsapp_chats"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "whatsapp_chat_messages" ADD CONSTRAINT "whatsapp_chat_messages_author_membership_fk" FOREIGN KEY ("author_user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "whatsapp_chats" ADD CONSTRAINT "whatsapp_chats_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "whatsapp_chats" ADD CONSTRAINT "whatsapp_chats_taken_over_by_membership_fk" FOREIGN KEY ("taken_over_by_user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "whatsapp_chats" ADD CONSTRAINT "whatsapp_chats_released_by_membership_fk" FOREIGN KEY ("released_by_user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "whatsapp_evolution_settings" ADD CONSTRAINT "whatsapp_evolution_settings_chat_takeover_timeout_check" CHECK ("chat_takeover_timeout_seconds" between 300 and 28800);