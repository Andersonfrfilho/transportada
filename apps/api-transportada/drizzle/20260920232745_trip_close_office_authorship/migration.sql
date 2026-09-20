ALTER TABLE "trips" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "closed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "close_reason" text;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_company_closed_by_user_fk" FOREIGN KEY ("company_id","closed_by_user_id") REFERENCES "user_company_memberships"("company_id","user_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_close_check" CHECK (("closed_at" is null) = ("closed_by_user_id" is null)
        and ("close_reason" is null or "closed_at" is not null));