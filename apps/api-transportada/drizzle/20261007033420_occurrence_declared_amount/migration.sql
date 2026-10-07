-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Spec 247 T2.2 (RF1, RF8, RF9, D8, D9): o número do documento do cliente e o valor pago viram dado.
-- Tudo aditivo, sem UPDATE em dado:
-- 1. nas duas exceções, `reference_number_mode` e `declared_amount_mode` NULAS e sem padrão — nulo herda
--    do tipo, campo a campo (D-a da 246);
-- 2. no tipo, os seis campos com padrão constante (modos `off`, escopo `item`, rótulos, linha vazia):
--    nenhum tipo existente muda de comportamento;
-- 3. na ocorrência e nos produtos, número, valor pago e a cópia do `vUnCom`, todos nulos (dinheiro em
--    numeric, nunca float);
-- 4. as CHECKs só depois das colunas. A forma `declared_amount_items` tem três termos: com o modo `off`
--    ela não se aplica, senão recusaria todo tipo existente com `items_mode = 'off'` (escopo padrão `item`).
-- `items_mode`, as exigências e os mínimos da 241/246 NÃO são tocados.
ALTER TABLE "company_occurrence_type_contractor_overrides" ADD COLUMN "reference_number_mode" varchar(16);--> statement-breakpoint
ALTER TABLE "company_occurrence_type_contractor_overrides" ADD COLUMN "declared_amount_mode" varchar(16);--> statement-breakpoint
ALTER TABLE "company_occurrence_type_recipient_overrides" ADD COLUMN "reference_number_mode" varchar(16);--> statement-breakpoint
ALTER TABLE "company_occurrence_type_recipient_overrides" ADD COLUMN "declared_amount_mode" varchar(16);--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD COLUMN "reference_number_mode" varchar(16) DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD COLUMN "reference_number_label" varchar(40) DEFAULT 'Número do documento do cliente' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD COLUMN "declared_amount_mode" varchar(16) DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD COLUMN "declared_amount_scope" varchar(16) DEFAULT 'item' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD COLUMN "declared_amount_label" varchar(40) DEFAULT 'Valor pago' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD COLUMN "email_item_line_template" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_document_occurrence_products" ADD COLUMN "unit_value" numeric(19,4);--> statement-breakpoint
ALTER TABLE "trip_document_occurrence_products" ADD COLUMN "declared_amount" numeric(14,4);--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" ADD COLUMN "reference_number" varchar(30);--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" ADD COLUMN "declared_amount" numeric(14,4);--> statement-breakpoint
ALTER TABLE "company_occurrence_type_contractor_overrides" ADD CONSTRAINT "occurrence_type_contractor_overrides_reference_mode_check" CHECK ("reference_number_mode" in ('required', 'optional', 'off'));--> statement-breakpoint
ALTER TABLE "company_occurrence_type_contractor_overrides" ADD CONSTRAINT "occurrence_type_contractor_overrides_declared_amount_mode_check" CHECK ("declared_amount_mode" in ('required', 'optional', 'off'));--> statement-breakpoint
ALTER TABLE "company_occurrence_type_recipient_overrides" ADD CONSTRAINT "occurrence_type_recipient_overrides_reference_mode_check" CHECK ("reference_number_mode" in ('required', 'optional', 'off'));--> statement-breakpoint
ALTER TABLE "company_occurrence_type_recipient_overrides" ADD CONSTRAINT "occurrence_type_recipient_overrides_declared_amount_mode_check" CHECK ("declared_amount_mode" in ('required', 'optional', 'off'));--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_reference_number_mode_check" CHECK ("reference_number_mode" in ('required', 'optional', 'off'));--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_reference_number_label_check" CHECK (length(btrim("reference_number_label")) > 0);--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_declared_amount_mode_check" CHECK ("declared_amount_mode" in ('required', 'optional', 'off'));--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_declared_amount_scope_check" CHECK ("declared_amount_scope" in ('item', 'occurrence'));--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_declared_amount_label_check" CHECK (length(btrim("declared_amount_label")) > 0);--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_email_item_line_template_check" CHECK (char_length("email_item_line_template") <= 400);--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_declared_amount_items_check" CHECK ("declared_amount_mode" = 'off' or "declared_amount_scope" = 'occurrence' or "items_mode" <> 'off');--> statement-breakpoint
ALTER TABLE "trip_document_occurrence_products" ADD CONSTRAINT "trip_document_occurrence_products_unit_value_check" CHECK ("unit_value" is null or "unit_value" >= 0);--> statement-breakpoint
ALTER TABLE "trip_document_occurrence_products" ADD CONSTRAINT "trip_document_occurrence_products_declared_amount_check" CHECK ("declared_amount" is null or ("declared_amount" >= 0 and "declared_amount" = round("declared_amount", 2)));--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" ADD CONSTRAINT "trip_document_occurrences_reference_number_check" CHECK ("reference_number" is null or ("reference_number" ~ '^[A-Za-z0-9 ./-]{1,30}$' and length(btrim("reference_number")) > 0));--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" ADD CONSTRAINT "trip_document_occurrences_declared_amount_check" CHECK ("declared_amount" is null or ("declared_amount" >= 0 and "declared_amount" = round("declared_amount", 2)));