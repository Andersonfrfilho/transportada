CREATE TABLE "contractor_portal_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"contractor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contractor_portal_bindings_membership_contractor_unique" UNIQUE("membership_id","contractor_id")
);
--> statement-breakpoint
CREATE TABLE "trip_location_pings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"latitude" numeric(10,7) NOT NULL,
	"longitude" numeric(10,7) NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_location_pings_coordinates_check" CHECK ("latitude" between -90 and 90 and "longitude" between -180 and 180)
);
--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD COLUMN "location_sharing_consent_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "contractor_portal_bindings_membership_idx" ON "contractor_portal_bindings" ("company_id","membership_id");--> statement-breakpoint
CREATE INDEX "trip_location_pings_trip_idx" ON "trip_location_pings" ("company_id","trip_id","recorded_at");--> statement-breakpoint
ALTER TABLE "contractor_portal_bindings" ADD CONSTRAINT "contractor_portal_bindings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "contractor_portal_bindings" ADD CONSTRAINT "contractor_portal_bindings_membership_fk" FOREIGN KEY ("membership_id","company_id") REFERENCES "user_company_memberships"("id","company_id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "contractor_portal_bindings" ADD CONSTRAINT "contractor_portal_bindings_contractor_fk" FOREIGN KEY ("company_id","contractor_id") REFERENCES "contractors"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_location_pings" ADD CONSTRAINT "trip_location_pings_trip_fk" FOREIGN KEY ("company_id","trip_id") REFERENCES "trips"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_location_pings" ADD CONSTRAINT "trip_location_pings_driver_fk" FOREIGN KEY ("company_id","driver_id") REFERENCES "fleet_drivers"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "membership_roles" DROP CONSTRAINT "membership_roles_role_check", ADD CONSTRAINT "membership_roles_role_check" CHECK ("role" in ('company-admin', 'finance', 'fiscal', 'operator', 'viewer', 'driver', 'aggregate', 'separator', 'contractor', 'automation'));--> statement-breakpoint
ALTER TABLE "user_invitation_roles" DROP CONSTRAINT "user_invitation_roles_role_check", ADD CONSTRAINT "user_invitation_roles_role_check" CHECK ("role" in ('company-admin', 'finance', 'fiscal', 'operator', 'viewer', 'driver', 'aggregate', 'separator', 'contractor'));