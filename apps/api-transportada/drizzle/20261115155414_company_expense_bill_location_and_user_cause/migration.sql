ALTER TABLE "company_expenses" ADD COLUMN "bill_location" varchar(120);--> statement-breakpoint
ALTER TABLE "company_expenses" ADD COLUMN "caused_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "company_expenses" ADD COLUMN "caused_by_name" varchar(120);--> statement-breakpoint
ALTER TABLE "company_expenses" ADD CONSTRAINT "company_expenses_single_cause_check" CHECK (num_nonnulls("caused_by_driver_id", "caused_by_user_id", "caused_by_name") <= 1);