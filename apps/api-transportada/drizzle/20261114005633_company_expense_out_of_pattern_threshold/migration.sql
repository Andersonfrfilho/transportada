-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Spec 325 T6.3 (RF23): o limite do alerta de "fora do padrão", por empresa, só aditivo. Uma coluna com padrão de 10%
-- (a linha existente não muda de comportamento) e um CHECK de 0 a 1000. A coluna mora em
-- `company_expense_allocation_settings`; a escrita grava o mesmo valor em todas as linhas da empresa.
ALTER TABLE "company_expense_allocation_settings" ADD COLUMN "out_of_pattern_threshold_percent" numeric(6,2) DEFAULT '10.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_expense_allocation_settings" ADD CONSTRAINT "company_expense_allocation_settings_threshold_check" CHECK ("out_of_pattern_threshold_percent" >= 0 and "out_of_pattern_threshold_percent" <= 1000);
