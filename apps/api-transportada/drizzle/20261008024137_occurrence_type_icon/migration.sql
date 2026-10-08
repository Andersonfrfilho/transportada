-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- O tipo de ocorrência ganha o nome do ícone do design system. Aditiva, sem UPDATE em dado:
-- 1. `icon_name` nula e sem padrão — nulo é tipo sem ícone, o comportamento de antes;
-- 2. a CHECK só depois da coluna, com o catálogo fechado; ampliar o catálogo é trocar a CHECK.
-- Só `company_occurrence_types`: as exceções por contratante/destinatário não têm ícone.
ALTER TABLE "company_occurrence_types" ADD COLUMN "icon_name" varchar(32);--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_icon_name_check" CHECK ("icon_name" is null or "icon_name" in ('alert', 'camera', 'clipboard-list', 'clock', 'document', 'invoice', 'message', 'money', 'package', 'truck'));