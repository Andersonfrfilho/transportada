CREATE TABLE "company_expense_amount_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"expense_id" uuid NOT NULL,
	"effective_competence" varchar(7) NOT NULL,
	"previous_amount" numeric(14,2) NOT NULL,
	"new_amount" numeric(14,2) NOT NULL,
	"changed_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_expense_amount_changes_competence_check" CHECK ("effective_competence" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "company_expense_amount_changes_amount_check" CHECK ("previous_amount" >= 0 and "new_amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "company_expenses" ADD COLUMN "bill_url" varchar(500);--> statement-breakpoint
CREATE INDEX "company_expense_amount_changes_expense_idx" ON "company_expense_amount_changes" ("expense_id","effective_competence","created_at");--> statement-breakpoint
ALTER TABLE "company_expense_amount_changes" ADD CONSTRAINT "company_expense_amount_changes_expense_fk" FOREIGN KEY ("company_id","expense_id") REFERENCES "company_expenses"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_expense_amount_changes" ADD CONSTRAINT "company_expense_amount_changes_changed_by_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
--> statement-breakpoint
-- Spec 329: categorias de consumo, internet/telefone e financiamentos para quem já usa Contas.
-- Só empresas que já têm categoria (as que não têm recebem as 13 no primeiro uso, `ensureSeeded`); idempotente pelo unique
-- (empresa, nome) e nunca mexe em categoria existente, renomeada ou desativada.
INSERT INTO "company_expense_categories" ("company_id", "name", "requires_driver", "display_order", "cost_group")
SELECT c."id", s."name", false, s."display_order", 'administrative'
FROM "companies" c
CROSS JOIN (VALUES
  ('Água e esgoto', 9),
  ('Energia elétrica', 10),
  ('Gás', 11),
  ('Internet e telefone', 12),
  ('Financiamentos', 13)
) AS s("name", "display_order")
WHERE EXISTS (SELECT 1 FROM "company_expense_categories" e WHERE e."company_id" = c."id")
ON CONFLICT ON CONSTRAINT "company_expense_categories_company_name_unique" DO NOTHING;
