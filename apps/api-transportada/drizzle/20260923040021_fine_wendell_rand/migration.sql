ALTER TABLE "trip_cost_entries" ADD COLUMN "entry_kind_id" uuid;--> statement-breakpoint
ALTER TABLE "trip_cost_entries" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trip_cost_entries" ADD COLUMN "removed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "trip_revenue_entries" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trip_revenue_entries" ADD COLUMN "removed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "trip_cost_entries" ADD CONSTRAINT "trip_cost_entries_entry_kind_fk" FOREIGN KEY ("company_id","entry_kind_id") REFERENCES "company_entry_kinds"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_cost_entries" ADD CONSTRAINT "trip_cost_entries_removed_check" CHECK (("removed_at" is null) = ("removed_by_user_id" is null));--> statement-breakpoint
ALTER TABLE "trip_revenue_entries" ADD CONSTRAINT "trip_revenue_entries_removed_check" CHECK (("removed_at" is null) = ("removed_by_user_id" is null));
