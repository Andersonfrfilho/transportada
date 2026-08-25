CREATE TABLE "aggregate_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"tax_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"declared_data" jsonb DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"rejection_reason" text DEFAULT '' NOT NULL,
	"driver_id" uuid,
	"duplicate_driver_id" uuid,
	"resubmitted_at" timestamp with time zone,
	"latest_submission" jsonb,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aggregate_applications_status_check" CHECK ("status" in ('pending', 'approved', 'rejected')),
	CONSTRAINT "aggregate_applications_tax_id_check" CHECK ("tax_id" ~ '^(?:[0-9]{11}|[A-Z0-9]{12}[0-9]{2})$'),
	CONSTRAINT "aggregate_applications_rejection_reason_check" CHECK ("status" <> 'rejected' or length("rejection_reason") > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "aggregate_applications_company_tax_id_pending_unique" ON "aggregate_applications" ("company_id","tax_id") WHERE "status" = 'pending';--> statement-breakpoint
ALTER TABLE "aggregate_applications" ADD CONSTRAINT "aggregate_applications_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "aggregate_applications" ADD CONSTRAINT "aggregate_applications_driver_id_fleet_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "fleet_drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "aggregate_applications" ADD CONSTRAINT "aggregate_applications_duplicate_driver_id_fleet_drivers_id_fk" FOREIGN KEY ("duplicate_driver_id") REFERENCES "fleet_drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;