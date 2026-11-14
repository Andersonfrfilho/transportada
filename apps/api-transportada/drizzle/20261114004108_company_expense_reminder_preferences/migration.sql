-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Spec 325 T7.3 (RF26): o canal que a pessoa quer receber o aviso de conta a vencer, além do e-mail. Uma linha por
-- pessoa e empresa; sem linha, só e-mail. WhatsApp e push nascem desligados (opt-in). Só aditiva: nenhuma linha muda.
CREATE TABLE "company_expense_reminder_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"whatsapp_enabled" boolean DEFAULT false NOT NULL,
	"push_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_expense_reminder_preferences_company_user_unique" UNIQUE("company_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "company_expense_reminder_preferences" ADD CONSTRAINT "company_expense_reminder_preferences_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_expense_reminder_preferences" ADD CONSTRAINT "company_expense_reminder_preferences_user_fk" FOREIGN KEY ("user_id") REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;