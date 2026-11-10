-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Spec 322: o interruptor da empresa para o e-mail do aviso da ocorrência que o motorista registra. Tabela nova,
-- aditiva e sem UPDATE: sem linha vale ligado, então nenhuma empresa muda de comportamento.
CREATE TABLE "company_driver_occurrence_email_settings" (
	"company_id" uuid PRIMARY KEY,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_user_id" uuid
);
--> statement-breakpoint
ALTER TABLE "company_driver_occurrence_email_settings" ADD CONSTRAINT "company_driver_occurrence_email_settings_company_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;