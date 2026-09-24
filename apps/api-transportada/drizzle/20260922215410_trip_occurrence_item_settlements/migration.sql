CREATE TABLE "trip_occurrence_item_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"product_code" text DEFAULT '' NOT NULL,
	"amount" numeric(14,4) NOT NULL,
	"amount_source" text NOT NULL,
	"payer_kind" text NOT NULL,
	"payer_id" uuid,
	"reimbursed_at" timestamp with time zone,
	"reimbursed_by_user_id" uuid,
	"recorded_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_occurrence_item_settlements_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "trip_occurrence_item_settlements_company_case_product_unique" UNIQUE("company_id","case_id","product_code"),
	CONSTRAINT "trip_occurrence_item_settlements_amount_source_check" CHECK ("amount_source" in ('nfe', 'manual')),
	CONSTRAINT "trip_occurrence_item_settlements_payer_kind_check" CHECK ("payer_kind" in ('driver', 'carrier', 'contractor', 'insurer')),
	CONSTRAINT "trip_occurrence_item_settlements_payer_id_check" CHECK (("payer_kind" = 'driver') = ("payer_id" is not null)),
	CONSTRAINT "trip_occurrence_item_settlements_reimbursement_check" CHECK ("payer_kind" <> 'carrier' or "reimbursed_at" is null),
	CONSTRAINT "trip_occurrence_item_settlements_reimbursed_by_check" CHECK (("reimbursed_at" is null) = ("reimbursed_by_user_id" is null)),
	CONSTRAINT "trip_occurrence_item_settlements_amount_check" CHECK ("amount" > 0)
);
--> statement-breakpoint
CREATE INDEX "trip_occurrence_item_settlements_company_driver_idx" ON "trip_occurrence_item_settlements" ("company_id","payer_id") WHERE "payer_id" is not null;--> statement-breakpoint
ALTER TABLE "trip_occurrence_item_settlements" ADD CONSTRAINT "trip_occurrence_item_settlements_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_occurrence_item_settlements" ADD CONSTRAINT "trip_occurrence_item_settlements_company_case_fk" FOREIGN KEY ("company_id","case_id") REFERENCES "trip_occurrence_cases"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_occurrence_item_settlements" ADD CONSTRAINT "trip_occurrence_item_settlements_company_driver_fk" FOREIGN KEY ("company_id","payer_id") REFERENCES "fleet_drivers"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;