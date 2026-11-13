-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Spec 325 T4.3 (ADR-0116 §1 e §2): o grupo de custo da categoria e o critério de rateio da empresa, aditivo. Uma
-- coluna com padrão e uma tabela nova; nada existente é apagado. A semente classifica as categorias da T1.2 (RF10) e
-- grava o critério padrão (RF11) para as empresas que já existem.
CREATE TABLE "company_expense_allocation_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"cost_group" varchar(16) NOT NULL,
	"criterion" varchar(16) NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_expense_allocation_settings_company_group_unique" UNIQUE("company_id","cost_group"),
	CONSTRAINT "company_expense_allocation_settings_cost_group_check" CHECK ("cost_group" in ('vehicle_fixed', 'per_km', 'administrative')),
	CONSTRAINT "company_expense_allocation_settings_criterion_check" CHECK ("criterion" in ('per_km', 'per_trip_day', 'per_revenue', 'equal'))
);
--> statement-breakpoint
ALTER TABLE "company_expense_categories" ADD COLUMN "cost_group" varchar(16) DEFAULT 'administrative' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_expense_allocation_settings" ADD CONSTRAINT "company_expense_allocation_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_expense_allocation_settings" ADD CONSTRAINT "company_expense_allocation_settings_updated_by_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_expense_categories" ADD CONSTRAINT "company_expense_categories_cost_group_check" CHECK ("cost_group" in ('vehicle_fixed', 'per_km', 'administrative', 'in_trip'));
--> statement-breakpoint
UPDATE "company_expense_categories" AS c
SET "cost_group" = s."cost_group"
FROM (VALUES
  ('Aluguel', 'administrative'),
  ('Folha', 'administrative'),
  ('Impostos', 'administrative'),
  ('Outros', 'administrative'),
  ('Seguro', 'vehicle_fixed'),
  ('Manutenção', 'per_km'),
  ('Combustível', 'per_km'),
  ('Pagamento de motorista/agregado', 'in_trip')
) AS s("name", "cost_group")
WHERE c."name" = s."name";
--> statement-breakpoint
INSERT INTO "company_expense_allocation_settings" ("company_id", "cost_group", "criterion")
SELECT c."id", s."cost_group", s."criterion"
FROM "companies" c
CROSS JOIN (VALUES
  ('vehicle_fixed', 'per_km'),
  ('per_km', 'per_km'),
  ('administrative', 'per_revenue')
) AS s("cost_group", "criterion")
ON CONFLICT ON CONSTRAINT "company_expense_allocation_settings_company_group_unique" DO NOTHING;
