CREATE TABLE "company_expense_subtypes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_expense_subtypes_company_category_id_unique" UNIQUE("company_id","category_id","id"),
	CONSTRAINT "company_expense_subtypes_name_check" CHECK (length(btrim("name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "company_expenses" ADD COLUMN "subtype_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "company_expense_subtypes_name_unique" ON "company_expense_subtypes" ("company_id","category_id",lower("name"));--> statement-breakpoint
CREATE INDEX "company_expenses_subtype_idx" ON "company_expenses" ("company_id","subtype_id") WHERE "subtype_id" is not null;--> statement-breakpoint
ALTER TABLE "company_expense_subtypes" ADD CONSTRAINT "company_expense_subtypes_category_fk" FOREIGN KEY ("company_id","category_id") REFERENCES "company_expense_categories"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_expenses" ADD CONSTRAINT "company_expenses_subtype_fk" FOREIGN KEY ("company_id","category_id","subtype_id") REFERENCES "company_expense_subtypes"("company_id","category_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;