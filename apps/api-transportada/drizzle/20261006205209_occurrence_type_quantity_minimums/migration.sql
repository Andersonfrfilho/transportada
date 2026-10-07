-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Spec 246 T1c.1 (RF1c, RF1c2, D-a): a quantidade mínima de fotos e de produtos vira dado. A ORDEM:
-- 1. nas duas exceções, `items_mode`, `photo_minimum_count` e `items_minimum_count` NULAS e sem
--    padrão — nulo herda do tipo, campo a campo; `items_mode` + `items_minimum_count` herdam como par;
-- 2. no tipo, `items_minimum_count` nulo (= todos os itens da nota) e `photo_minimum_count` nasce nula;
-- 3. T1c.2: o `UPDATE` grava 1 em todo tipo (o que a foto obrigatória sempre exigiu — comportamento
--    preservado) e só então a coluna vira `DEFAULT 1 NOT NULL`; `items_mode` do tipo NÃO é tocado e
--    as colunas novas das exceções ficam nulas (herdam);
-- 4. as CHECKs só depois do dado conforme: vocabulário de `items_mode` (nulo passa), mínimo de foto 1..5,
--    mínimo de produtos >= 1, e a forma (`items_minimum_count` só com `items_mode = 'required'`).
-- `items_mode` do tipo, a CHECK de vocabulário e a `items_off_shape_check` são da 241 e NÃO são tocadas.
-- Sem CHECK `off ⇒ unset` nas exceções: a política de reentrega é do tipo (plan § T1c.1).
ALTER TABLE "company_occurrence_type_contractor_overrides" ADD COLUMN "items_mode" varchar(16);--> statement-breakpoint
ALTER TABLE "company_occurrence_type_contractor_overrides" ADD COLUMN "photo_minimum_count" smallint;--> statement-breakpoint
ALTER TABLE "company_occurrence_type_contractor_overrides" ADD COLUMN "items_minimum_count" smallint;--> statement-breakpoint
ALTER TABLE "company_occurrence_type_recipient_overrides" ADD COLUMN "items_mode" varchar(16);--> statement-breakpoint
ALTER TABLE "company_occurrence_type_recipient_overrides" ADD COLUMN "photo_minimum_count" smallint;--> statement-breakpoint
ALTER TABLE "company_occurrence_type_recipient_overrides" ADD COLUMN "items_minimum_count" smallint;--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD COLUMN "photo_minimum_count" smallint;--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD COLUMN "items_minimum_count" smallint;--> statement-breakpoint
UPDATE "company_occurrence_types" SET "photo_minimum_count" = 1;--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ALTER COLUMN "photo_minimum_count" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ALTER COLUMN "photo_minimum_count" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "company_occurrence_type_contractor_overrides" ADD CONSTRAINT "occurrence_type_contractor_overrides_items_mode_check" CHECK ("items_mode" in ('required', 'optional', 'off'));--> statement-breakpoint
ALTER TABLE "company_occurrence_type_contractor_overrides" ADD CONSTRAINT "occurrence_type_contractor_overrides_photo_minimum_count_check" CHECK ("photo_minimum_count" between 1 and 5);--> statement-breakpoint
ALTER TABLE "company_occurrence_type_contractor_overrides" ADD CONSTRAINT "occurrence_type_contractor_overrides_items_minimum_count_check" CHECK ("items_minimum_count" >= 1);--> statement-breakpoint
ALTER TABLE "company_occurrence_type_contractor_overrides" ADD CONSTRAINT "occurrence_type_contractor_overrides_items_minimum_shape_check" CHECK ("items_minimum_count" is null or coalesce("items_mode", '') = 'required');--> statement-breakpoint
ALTER TABLE "company_occurrence_type_recipient_overrides" ADD CONSTRAINT "occurrence_type_recipient_overrides_items_mode_check" CHECK ("items_mode" in ('required', 'optional', 'off'));--> statement-breakpoint
ALTER TABLE "company_occurrence_type_recipient_overrides" ADD CONSTRAINT "occurrence_type_recipient_overrides_photo_minimum_count_check" CHECK ("photo_minimum_count" between 1 and 5);--> statement-breakpoint
ALTER TABLE "company_occurrence_type_recipient_overrides" ADD CONSTRAINT "occurrence_type_recipient_overrides_items_minimum_count_check" CHECK ("items_minimum_count" >= 1);--> statement-breakpoint
ALTER TABLE "company_occurrence_type_recipient_overrides" ADD CONSTRAINT "occurrence_type_recipient_overrides_items_minimum_shape_check" CHECK ("items_minimum_count" is null or coalesce("items_mode", '') = 'required');--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_photo_minimum_count_check" CHECK ("photo_minimum_count" between 1 and 5);--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_items_minimum_count_check" CHECK ("items_minimum_count" >= 1);--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_items_minimum_shape_check" CHECK ("items_minimum_count" is null or "items_mode" = 'required');