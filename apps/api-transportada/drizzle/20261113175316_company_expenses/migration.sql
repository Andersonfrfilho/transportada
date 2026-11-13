-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Spec 325 T1.2: módulo Contas (despesa da empresa), aditivo. Três tabelas novas e a semente das categorias (RF2) para
-- as empresas que já existem. Nada de tabela existente é alterado ou apagado.
CREATE TABLE "company_expense_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"requires_driver" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_expense_categories_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "company_expense_categories_company_name_unique" UNIQUE("company_id","name")
);
--> statement-breakpoint
CREATE TABLE "company_expense_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"expense_id" uuid NOT NULL,
	"competence" varchar(7) NOT NULL,
	"slot" smallint DEFAULT 1 NOT NULL,
	"due_date" date NOT NULL,
	"expected_amount" numeric(14,2) NOT NULL,
	"status" varchar(16) DEFAULT 'open' NOT NULL,
	"paid_amount" numeric(14,2),
	"paid_at" timestamp with time zone,
	"paid_by_user_id" uuid,
	"settlement_note" text,
	"canceled_at" timestamp with time zone,
	"canceled_by_user_id" uuid,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_expense_occurrences_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "company_expense_occurrences_expense_competence_slot_unique" UNIQUE("expense_id","competence","slot"),
	CONSTRAINT "company_expense_occurrences_status_check" CHECK ("status" in ('open', 'paid', 'canceled')),
	CONSTRAINT "company_expense_occurrences_slot_check" CHECK ("slot" in (1, 2)),
	CONSTRAINT "company_expense_occurrences_competence_check" CHECK ("competence" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "company_expense_occurrences_amount_check" CHECK ("expected_amount" >= 0),
	CONSTRAINT "company_expense_occurrences_paid_check" CHECK (("status" = 'paid' and "paid_amount" > 0 and "paid_at" is not null and "paid_by_user_id" is not null) or ("status" <> 'paid' and "paid_amount" is null and "paid_at" is null and "paid_by_user_id" is null)),
	CONSTRAINT "company_expense_occurrences_canceled_check" CHECK (("status" = 'canceled') = ("canceled_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "company_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" varchar(16) NOT NULL,
	"category_id" uuid NOT NULL,
	"expected_amount" numeric(14,2) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"recurrence" varchar(16),
	"due_day" smallint,
	"payee_driver_id" uuid,
	"vehicle_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_expenses_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "company_expenses_kind_check" CHECK ("kind" in ('fixed', 'variable')),
	CONSTRAINT "company_expenses_recurrence_check" CHECK ("recurrence" is null or "recurrence" in ('monthly', 'bimonthly', 'quarterly', 'yearly', 'fortnightly')),
	CONSTRAINT "company_expenses_amount_check" CHECK ("expected_amount" >= 0),
	CONSTRAINT "company_expenses_due_day_check" CHECK ("due_day" is null or "due_day" between 1 and 31),
	CONSTRAINT "company_expenses_schedule_check" CHECK (("kind" = 'fixed' and "recurrence" is not null and ("recurrence" = 'fortnightly' or "due_day" is not null)) or ("kind" = 'variable' and "recurrence" is null and "due_day" is null))
);
--> statement-breakpoint
CREATE INDEX "company_expense_occurrences_due_idx" ON "company_expense_occurrences" ("company_id","due_date","status");--> statement-breakpoint
CREATE INDEX "company_expenses_company_idx" ON "company_expenses" ("company_id","active","kind");--> statement-breakpoint
CREATE INDEX "company_expenses_payee_driver_idx" ON "company_expenses" ("company_id","payee_driver_id") WHERE "payee_driver_id" is not null;--> statement-breakpoint
ALTER TABLE "company_expense_categories" ADD CONSTRAINT "company_expense_categories_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_expense_occurrences" ADD CONSTRAINT "company_expense_occurrences_expense_fk" FOREIGN KEY ("company_id","expense_id") REFERENCES "company_expenses"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_expense_occurrences" ADD CONSTRAINT "company_expense_occurrences_paid_by_fk" FOREIGN KEY ("paid_by_user_id") REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_expense_occurrences" ADD CONSTRAINT "company_expense_occurrences_canceled_by_fk" FOREIGN KEY ("canceled_by_user_id") REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_expenses" ADD CONSTRAINT "company_expenses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_expenses" ADD CONSTRAINT "company_expenses_category_fk" FOREIGN KEY ("company_id","category_id") REFERENCES "company_expense_categories"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_expenses" ADD CONSTRAINT "company_expenses_payee_driver_fk" FOREIGN KEY ("company_id","payee_driver_id") REFERENCES "fleet_drivers"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_expenses" ADD CONSTRAINT "company_expenses_vehicle_fk" FOREIGN KEY ("company_id","vehicle_id") REFERENCES "fleet_vehicles"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;
--> statement-breakpoint
INSERT INTO "company_expense_categories" ("company_id", "name", "requires_driver", "display_order")
SELECT c."id", s."name", s."requires_driver", s."display_order"
FROM "companies" c
CROSS JOIN (VALUES
  ('Aluguel', false, 1),
  ('Folha', false, 2),
  ('Impostos', false, 3),
  ('Seguro', false, 4),
  ('Manutenção', false, 5),
  ('Combustível', false, 6),
  ('Pagamento de motorista/agregado', true, 7),
  ('Outros', false, 8)
) AS s("name", "requires_driver", "display_order")
ON CONFLICT ON CONSTRAINT "company_expense_categories_company_name_unique" DO NOTHING;
