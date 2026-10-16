-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Spec 269 (ADR-0106): o e-mail da ocorrência usa um modelo do cadastro "E-mail com contratantes -> Modelos".
-- Tipo de e-mail novo `occurrence` e a escolha do modelo no tipo de ocorrência e na exceção por contratante
-- (nulo = sem modelo / herda do tipo). Aditiva: nenhuma linha antiga muda, sem backfill (começa do zero).
ALTER TABLE "company_occurrence_type_contractor_overrides" ADD COLUMN "contractor_mail_template_id" uuid;--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD COLUMN "contractor_mail_template_id" uuid;--> statement-breakpoint
CREATE INDEX "occurrence_type_contractor_overrides_mail_template_idx" ON "company_occurrence_type_contractor_overrides" ("company_id","contractor_mail_template_id") WHERE "contractor_mail_template_id" is not null;--> statement-breakpoint
CREATE INDEX "company_occurrence_types_mail_template_idx" ON "company_occurrence_types" ("company_id","contractor_mail_template_id") WHERE "contractor_mail_template_id" is not null;--> statement-breakpoint
ALTER TABLE "company_occurrence_type_contractor_overrides" ADD CONSTRAINT "occurrence_type_contractor_overrides_mail_template_fk" FOREIGN KEY ("company_id","contractor_mail_template_id") REFERENCES "contractor_mail_templates"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_mail_template_fk" FOREIGN KEY ("company_id","contractor_mail_template_id") REFERENCES "contractor_mail_templates"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "contractor_mail_templates" DROP CONSTRAINT "contractor_mail_templates_mail_type_check", ADD CONSTRAINT "contractor_mail_templates_mail_type_check" CHECK ("mail_type" in ('address_correction', 'occurrence'));