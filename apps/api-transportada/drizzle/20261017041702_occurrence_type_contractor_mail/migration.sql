-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Spec 271 (ADR-0108): o modelo do e-mail a contratante vem do modulo de notificacao. O tipo guarda a chave do modelo
-- (`contractor_notification_template_key`, sem FK: a identidade do modulo e versionada) e o momento da escolha; ganha a
-- lista de responsaveis em copia e a de destinatarios (so tipo `listed`); a mensagem grava a chave e a versao do modelo.
-- Aditiva: nenhuma linha antiga muda, sem backfill (comeca do zero).
CREATE TABLE "company_occurrence_type_recipients" (
	"company_id" uuid,
	"occurrence_type_id" uuid,
	"contact_id" uuid,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_occurrence_type_recipients_pk" PRIMARY KEY("company_id","occurrence_type_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "company_occurrence_type_watchers" (
	"company_id" uuid,
	"occurrence_type_id" uuid,
	"user_id" uuid,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_occurrence_type_watchers_pk" PRIMARY KEY("company_id","occurrence_type_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "contractor_mail_messages" ADD COLUMN "notification_template_key" varchar(128);--> statement-breakpoint
ALTER TABLE "contractor_mail_messages" ADD COLUMN "notification_template_version" integer;--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD COLUMN "contractor_notification_template_key" varchar(128);--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD COLUMN "contractor_notification_template_selected_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "company_occurrence_type_recipients_contact_idx" ON "company_occurrence_type_recipients" ("company_id","contact_id");--> statement-breakpoint
CREATE INDEX "company_occurrence_type_watchers_user_idx" ON "company_occurrence_type_watchers" ("company_id","user_id");--> statement-breakpoint
ALTER TABLE "company_occurrence_type_recipients" ADD CONSTRAINT "company_occurrence_type_recipients_type_fk" FOREIGN KEY ("company_id","occurrence_type_id") REFERENCES "company_occurrence_types"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_occurrence_type_recipients" ADD CONSTRAINT "company_occurrence_type_recipients_contact_fk" FOREIGN KEY ("company_id","contact_id") REFERENCES "contractor_contacts"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_occurrence_type_watchers" ADD CONSTRAINT "company_occurrence_type_watchers_type_fk" FOREIGN KEY ("company_id","occurrence_type_id") REFERENCES "company_occurrence_types"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_occurrence_type_watchers" ADD CONSTRAINT "company_occurrence_type_watchers_company_watcher_fk" FOREIGN KEY ("company_id","user_id") REFERENCES "company_occurrence_watchers"("company_id","user_id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_contractor_notification_template_key_check" CHECK ("contractor_notification_template_key" is null or length(btrim("contractor_notification_template_key")) > 0);