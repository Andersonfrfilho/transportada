ALTER TABLE "trips" ADD COLUMN "requires_mdfe" boolean;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "requires_mdfe_reason" text;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "requires_mdfe_actor_user_id" uuid;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "requires_mdfe_set_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_requires_mdfe_actor_membership_fk" FOREIGN KEY ("requires_mdfe_actor_user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_requires_mdfe_reason_check" CHECK (("requires_mdfe_reason" is null) or ("requires_mdfe" = false));--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_requires_mdfe_trail_check" CHECK (("requires_mdfe" is null) = ("requires_mdfe_actor_user_id" is null)
        and ("requires_mdfe" is null) = ("requires_mdfe_set_at" is null));