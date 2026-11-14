-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Spec 325 T7.2 (RF24 a RF31): o schema dos lembretes de vencimento e da baixa por resposta, só aditivo. Responsável da
-- conta; configuração dos lembretes por empresa (sem linha vale o padrão); registro dos avisos e dos resumos enviados
-- (a chave única é o que torna a rotina idempotente); link de uso único do "Já paguei" (só o hash do token); canal e hora
-- da baixa por resposta na ocorrência, para o desfazer de 24 h (RF31). Nenhuma linha existente muda.
CREATE TABLE "company_expense_reminder_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL CONSTRAINT "company_expense_reminder_settings_company_unique" UNIQUE,
	"days_before" smallint DEFAULT 3 NOT NULL,
	"max_overdue_notices" smallint DEFAULT 3 NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"whatsapp_enabled" boolean DEFAULT false NOT NULL,
	"push_enabled" boolean DEFAULT false NOT NULL,
	"daily_summary_enabled" boolean DEFAULT false NOT NULL,
	"daily_summary_hour" smallint DEFAULT 8 NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_expense_reminder_settings_days_check" CHECK ("days_before" between 0 and 30 and "max_overdue_notices" between 0 and 10),
	CONSTRAINT "company_expense_reminder_settings_summary_hour_check" CHECK ("daily_summary_hour" between 0 and 23)
);
--> statement-breakpoint
CREATE TABLE "company_expense_reminders_sent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"occurrence_id" uuid NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"kind" varchar(16) NOT NULL,
	"channel" varchar(16) NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_expense_reminders_sent_key_unique" UNIQUE("occurrence_id","recipient_user_id","day","kind"),
	CONSTRAINT "company_expense_reminders_sent_kind_check" CHECK ("kind" in ('before', 'due_today', 'overdue')),
	CONSTRAINT "company_expense_reminders_sent_channel_check" CHECK ("channel" in ('email', 'push', 'whatsapp'))
);
--> statement-breakpoint
CREATE TABLE "company_expense_reply_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"occurrence_id" uuid NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL CONSTRAINT "company_expense_reply_links_token_hash_unique" UNIQUE,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_expense_reply_links_token_hash_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "company_expense_summaries_sent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_expense_summaries_sent_key_unique" UNIQUE("company_id","recipient_user_id","day")
);
--> statement-breakpoint
ALTER TABLE "company_expense_occurrences" ADD COLUMN "settled_via_channel" varchar(16);--> statement-breakpoint
ALTER TABLE "company_expense_occurrences" ADD COLUMN "settled_by_reply_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "company_expenses" ADD COLUMN "responsible_user_id" uuid;--> statement-breakpoint
CREATE INDEX "company_expense_reminders_sent_day_idx" ON "company_expense_reminders_sent" ("company_id","day");--> statement-breakpoint
CREATE INDEX "company_expense_reply_links_occurrence_idx" ON "company_expense_reply_links" ("occurrence_id");--> statement-breakpoint
ALTER TABLE "company_expense_reminder_settings" ADD CONSTRAINT "company_expense_reminder_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_expense_reminder_settings" ADD CONSTRAINT "company_expense_reminder_settings_updated_by_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_expense_reminders_sent" ADD CONSTRAINT "company_expense_reminders_sent_occurrence_fk" FOREIGN KEY ("company_id","occurrence_id") REFERENCES "company_expense_occurrences"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_expense_reminders_sent" ADD CONSTRAINT "company_expense_reminders_sent_recipient_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_expense_reply_links" ADD CONSTRAINT "company_expense_reply_links_occurrence_fk" FOREIGN KEY ("company_id","occurrence_id") REFERENCES "company_expense_occurrences"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_expense_reply_links" ADD CONSTRAINT "company_expense_reply_links_recipient_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_expense_summaries_sent" ADD CONSTRAINT "company_expense_summaries_sent_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_expense_summaries_sent" ADD CONSTRAINT "company_expense_summaries_sent_recipient_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_expenses" ADD CONSTRAINT "company_expenses_responsible_user_fk" FOREIGN KEY ("responsible_user_id") REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_expense_occurrences" ADD CONSTRAINT "company_expense_occurrences_reply_check" CHECK (("settled_via_channel" is null) = ("settled_by_reply_at" is null) and ("settled_via_channel" is null or "status" = 'paid') and ("settled_via_channel" is null or "settled_via_channel" in ('email', 'whatsapp')));