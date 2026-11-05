-- Spec 294 T4.8 (RF23): a pergunta aberta sobre a foto de canhoto que o bot não ligou a uma nota. Aditiva: só cria a tabela.
CREATE TABLE "whatsapp_canhoto_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"origin_channel" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"candidates" jsonb DEFAULT '[]' NOT NULL,
	"object_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"sha256" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"provider_message_id" text NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "whatsapp_canhoto_questions_kind_check" CHECK ("kind" in ('confirm_note', 'choose_note', 'photo_kind')),
	CONSTRAINT "whatsapp_canhoto_questions_status_check" CHECK ("status" in ('open', 'completed', 'cancelled')),
	CONSTRAINT "whatsapp_canhoto_questions_channel_check" CHECK ("origin_channel" in ('group', 'individual')),
	CONSTRAINT "whatsapp_canhoto_questions_closed_check" CHECK (("status" = 'open') = ("closed_at" is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_canhoto_questions_company_driver_open_unique" ON "whatsapp_canhoto_questions" ("company_id","driver_id") WHERE "status" = 'open';--> statement-breakpoint
CREATE INDEX "whatsapp_canhoto_questions_company_driver_idx" ON "whatsapp_canhoto_questions" ("company_id","driver_id");--> statement-breakpoint
ALTER TABLE "whatsapp_canhoto_questions" ADD CONSTRAINT "whatsapp_canhoto_questions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "whatsapp_canhoto_questions" ADD CONSTRAINT "whatsapp_canhoto_questions_company_driver_fk" FOREIGN KEY ("company_id","driver_id") REFERENCES "fleet_drivers"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;