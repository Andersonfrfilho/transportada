ALTER TABLE "company_occurrence_types" ADD COLUMN "client_email_type" varchar(16) DEFAULT 'off' NOT NULL;--> statement-breakpoint
-- Spec 279 T3b (RF9): o botao "Enviar ao cliente" e escolha explicita do tipo. Padrao constante `off`, sem UPDATE: nenhum tipo existente liga.
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_client_email_type_check" CHECK ("client_email_type" in ('off', 'boleto', 'invoice', 'finance', 'general'));
