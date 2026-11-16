-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Spec 325 T1.4b: viagens do pagamento de motorista/agregado/ajudante, aditivo. Uma tabela nova; nada existente muda.
-- A chave unique(trip_id, parcel_kind, driver_id) já serve à T1.4c (ajudante): ela não precisa de migration.
CREATE TABLE "company_expense_occurrence_trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"occurrence_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"parcel_kind" varchar(16) NOT NULL,
	"driver_id" uuid NOT NULL,
	"amount" numeric(14,2) NOT NULL,
	"daily_amount" numeric(19,4) NOT NULL,
	"days" integer NOT NULL,
	"completed_on" date NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_expense_occurrence_trips_trip_parcel_driver_unique" UNIQUE("trip_id","parcel_kind","driver_id"),
	CONSTRAINT "company_expense_occurrence_trips_parcel_kind_check" CHECK ("parcel_kind" in ('driver', 'helper')),
	CONSTRAINT "company_expense_occurrence_trips_amount_check" CHECK ("amount" >= 0),
	CONSTRAINT "company_expense_occurrence_trips_daily_amount_check" CHECK ("daily_amount" >= 0),
	CONSTRAINT "company_expense_occurrence_trips_days_check" CHECK ("days" >= 1)
);
--> statement-breakpoint
CREATE INDEX "company_expense_occurrence_trips_occurrence_idx" ON "company_expense_occurrence_trips" ("company_id","occurrence_id");--> statement-breakpoint
ALTER TABLE "company_expense_occurrence_trips" ADD CONSTRAINT "company_expense_occurrence_trips_occurrence_fk" FOREIGN KEY ("company_id","occurrence_id") REFERENCES "company_expense_occurrences"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_expense_occurrence_trips" ADD CONSTRAINT "company_expense_occurrence_trips_trip_fk" FOREIGN KEY ("company_id","trip_id") REFERENCES "trips"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_expense_occurrence_trips" ADD CONSTRAINT "company_expense_occurrence_trips_driver_fk" FOREIGN KEY ("company_id","driver_id") REFERENCES "fleet_drivers"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_expense_occurrence_trips" ADD CONSTRAINT "company_expense_occurrence_trips_created_by_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;