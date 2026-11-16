ALTER TABLE "company_expenses" ADD COLUMN "caused_by_driver_id" uuid;--> statement-breakpoint
ALTER TABLE "company_expenses" ADD COLUMN "bill_location" varchar(120);--> statement-breakpoint
ALTER TABLE "company_expenses" ADD COLUMN "caused_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "company_expenses" ADD COLUMN "caused_by_name" varchar(120);--> statement-breakpoint
CREATE INDEX "company_expenses_caused_by_driver_idx" ON "company_expenses" ("company_id","caused_by_driver_id") WHERE "caused_by_driver_id" is not null;--> statement-breakpoint
ALTER TABLE "company_expenses" ADD CONSTRAINT "company_expenses_caused_by_driver_fk" FOREIGN KEY ("company_id","caused_by_driver_id") REFERENCES "fleet_drivers"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_expenses" ADD CONSTRAINT "company_expenses_single_cause_check" CHECK (num_nonnulls("caused_by_driver_id", "caused_by_user_id", "caused_by_name") <= 1);