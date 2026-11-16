-- Spec 329: o histórico de valores distingue reajuste (vale a partir de um mês) de correção (valor digitado errado).
ALTER TABLE "company_expense_amount_changes" ADD COLUMN "kind" varchar(16) DEFAULT 'adjustment' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_expense_amount_changes" ADD CONSTRAINT "company_expense_amount_changes_kind_check" CHECK ("kind" in ('adjustment', 'correction'));
