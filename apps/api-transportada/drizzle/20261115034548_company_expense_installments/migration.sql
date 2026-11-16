-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Spec 325 (extensão "parcelas"): a conta fixa pode ter um total de parcelas e a ocorrência guarda o número dela.
-- Só aditivo: duas colunas nulas (conta sem total continua recorrente sem fim) e um CHECK (2 a 600, só conta fixa).
ALTER TABLE "company_expense_occurrences" ADD COLUMN "installment_number" smallint;--> statement-breakpoint
ALTER TABLE "company_expenses" ADD COLUMN "installments_total" smallint;--> statement-breakpoint
ALTER TABLE "company_expenses" ADD CONSTRAINT "company_expenses_installments_check" CHECK ("installments_total" is null or ("kind" = 'fixed' and "installments_total" between 2 and 600));