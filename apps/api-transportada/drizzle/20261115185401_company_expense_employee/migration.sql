ALTER TABLE "company_expenses" ADD COLUMN "employee_driver_id" uuid;--> statement-breakpoint
ALTER TABLE "company_expenses" ADD COLUMN "employee_user_id" uuid;--> statement-breakpoint
ALTER TABLE "company_expenses" ADD COLUMN "employee_name" varchar(120);--> statement-breakpoint
ALTER TABLE "company_expenses" ADD COLUMN "employment_type" varchar(16);--> statement-breakpoint
ALTER TABLE "company_expenses" ADD CONSTRAINT "company_expenses_employee_driver_fk" FOREIGN KEY ("company_id","employee_driver_id") REFERENCES "fleet_drivers"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_expenses" ADD CONSTRAINT "company_expenses_employee_user_fk" FOREIGN KEY ("employee_user_id") REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_expenses" ADD CONSTRAINT "company_expenses_single_employee_check" CHECK (num_nonnulls("employee_driver_id", "employee_user_id", "employee_name") <= 1);--> statement-breakpoint
ALTER TABLE "company_expenses" ADD CONSTRAINT "company_expenses_employment_type_check" CHECK ("employment_type" is null or "employment_type" in ('clt', 'daily', 'autonomous', 'other'));
--> statement-breakpoint
-- Spec 330: categoria "Cartão de crédito" (a fatura do cartão) para quem já usa Contas; idempotente pelo unique
-- (empresa, nome) e nunca mexe em categoria existente, renomeada ou desativada.
INSERT INTO "company_expense_categories" ("company_id", "name", "requires_driver", "display_order", "cost_group")
SELECT c."id", 'Cartão de crédito', false, 15, 'administrative'
FROM "companies" c
WHERE EXISTS (SELECT 1 FROM "company_expense_categories" e WHERE e."company_id" = c."id")
ON CONFLICT ON CONSTRAINT "company_expense_categories_company_name_unique" DO NOTHING;
