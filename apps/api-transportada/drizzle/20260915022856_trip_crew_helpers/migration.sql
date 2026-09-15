CREATE TABLE "company_crew_settings" (
	"company_id" uuid PRIMARY KEY,
	"helper_daily_rate" numeric(19,4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_crew_settings_helper_daily_rate_check" CHECK ("helper_daily_rate" is null or "helper_daily_rate" >= 0)
);
--> statement-breakpoint
CREATE TABLE "driver_assignment_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"suggestion_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"recommended_driver_id" uuid,
	"chosen_driver_id" uuid,
	"actor_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "driver_assignment_feedback_company_suggestion_vehicle_unique" UNIQUE("company_id","suggestion_id","vehicle_id"),
	CONSTRAINT "driver_assignment_feedback_driver_check" CHECK ("recommended_driver_id" is not null or "chosen_driver_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "route_suggestion_vehicle_helpers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"suggestion_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "route_suggestion_vehicle_helpers_suggestion_driver_unique" UNIQUE("company_id","suggestion_id","driver_id")
);
--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD COLUMN "can_act_as_helper" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD COLUMN "helper_daily_rate" numeric(19,4);--> statement-breakpoint
ALTER TABLE "route_suggestion_vehicles" ADD COLUMN "driver_source" text;--> statement-breakpoint
ALTER TABLE "trip_drivers" ADD COLUMN "role" text DEFAULT 'driver' NOT NULL;--> statement-breakpoint
ALTER TABLE "route_suggestion_vehicles" ADD CONSTRAINT "route_suggestion_vehicles_company_suggestion_vehicle_unique" UNIQUE("company_id","suggestion_id","vehicle_id");--> statement-breakpoint
CREATE INDEX "driver_assignment_feedback_company_vehicle_created_idx" ON "driver_assignment_feedback" ("company_id","vehicle_id","created_at");--> statement-breakpoint
ALTER TABLE "company_crew_settings" ADD CONSTRAINT "company_crew_settings_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "driver_assignment_feedback" ADD CONSTRAINT "driver_assignment_feedback_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "driver_assignment_feedback" ADD CONSTRAINT "driver_assignment_feedback_suggestion_fk" FOREIGN KEY ("company_id","suggestion_id") REFERENCES "route_suggestions"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "driver_assignment_feedback" ADD CONSTRAINT "driver_assignment_feedback_vehicle_fk" FOREIGN KEY ("company_id","vehicle_id") REFERENCES "fleet_vehicles"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "driver_assignment_feedback" ADD CONSTRAINT "driver_assignment_feedback_recommended_driver_fk" FOREIGN KEY ("company_id","recommended_driver_id") REFERENCES "fleet_drivers"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "driver_assignment_feedback" ADD CONSTRAINT "driver_assignment_feedback_chosen_driver_fk" FOREIGN KEY ("company_id","chosen_driver_id") REFERENCES "fleet_drivers"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "driver_assignment_feedback" ADD CONSTRAINT "driver_assignment_feedback_actor_membership_fk" FOREIGN KEY ("actor_user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "route_suggestion_vehicle_helpers" ADD CONSTRAINT "route_suggestion_vehicle_helpers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "route_suggestion_vehicle_helpers" ADD CONSTRAINT "route_suggestion_vehicle_helpers_vehicle_fk" FOREIGN KEY ("company_id","suggestion_id","vehicle_id") REFERENCES "route_suggestion_vehicles"("company_id","suggestion_id","vehicle_id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "route_suggestion_vehicle_helpers" ADD CONSTRAINT "route_suggestion_vehicle_helpers_driver_fk" FOREIGN KEY ("company_id","driver_id") REFERENCES "fleet_drivers"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD CONSTRAINT "fleet_drivers_helper_daily_rate_check" CHECK ("helper_daily_rate" is null or "helper_daily_rate" >= 0);--> statement-breakpoint
ALTER TABLE "route_suggestion_vehicles" ADD CONSTRAINT "route_suggestion_vehicles_driver_source_check" CHECK ("driver_source" is null or ("driver_id" is not null and "driver_source" in ('link', 'recommended', 'manual')));--> statement-breakpoint
ALTER TABLE "trip_drivers" ADD CONSTRAINT "trip_drivers_role_check" CHECK ("role" in ('driver', 'helper'));--> statement-breakpoint
ALTER TABLE "trip_drivers" ADD CONSTRAINT "trip_drivers_lead_role_check" CHECK ("position" <> 1 or "role" = 'driver');