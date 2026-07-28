CREATE TABLE "fleet_driver_vehicle_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fleet_driver_vehicle_assignments_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "fleet_driver_vehicle_assignments_period_check" CHECK ("released_at" is null or "released_at" >= "assigned_at")
);
--> statement-breakpoint
CREATE TABLE "fleet_drivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"membership_id" uuid,
	"name" text NOT NULL,
	"tax_id" text NOT NULL,
	"license_number" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fleet_drivers_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "fleet_drivers_company_id_tax_id_unique" UNIQUE("company_id","tax_id"),
	CONSTRAINT "fleet_drivers_tax_id_check" CHECK ("tax_id" ~ '^[0-9]{11}$'),
	CONSTRAINT "fleet_drivers_name_check" CHECK (length("name") > 0 and length("name") <= 60),
	CONSTRAINT "fleet_drivers_license_number_check" CHECK (length("license_number") = 0 or "license_number" ~ '^[0-9]{11}$'),
	CONSTRAINT "fleet_drivers_phone_check" CHECK (length("phone") = 0 or "phone" ~ '^[0-9]{10,11}$'),
	CONSTRAINT "fleet_drivers_status_check" CHECK ("status" in ('active', 'inactive')),
	CONSTRAINT "fleet_drivers_version_check" CHECK ("version" > 0)
);
--> statement-breakpoint
CREATE TABLE "fleet_vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"plate" text NOT NULL,
	"renavam" text DEFAULT '' NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"tare_weight_kg" bigint DEFAULT 0 NOT NULL,
	"capacity_kg" bigint DEFAULT 0 NOT NULL,
	"capacity_m3" bigint DEFAULT 0 NOT NULL,
	"wheel_type" text DEFAULT '' NOT NULL,
	"body_type" text DEFAULT '00' NOT NULL,
	"state" text NOT NULL,
	"ownership" text DEFAULT 'own' NOT NULL,
	"owner_tax_id" text DEFAULT '' NOT NULL,
	"owner_name" text DEFAULT '' NOT NULL,
	"owner_state" text DEFAULT '' NOT NULL,
	"owner_rntrc" text DEFAULT '' NOT NULL,
	"owner_tax_regime" text DEFAULT '' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fleet_vehicles_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "fleet_vehicles_company_id_plate_unique" UNIQUE("company_id","plate"),
	CONSTRAINT "fleet_vehicles_plate_check" CHECK ("plate" ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
	CONSTRAINT "fleet_vehicles_renavam_check" CHECK (length("renavam") = 0 or "renavam" ~ '^[0-9]{9,11}$'),
	CONSTRAINT "fleet_vehicles_role_check" CHECK ("role" in ('traction', 'trailer')),
	CONSTRAINT "fleet_vehicles_status_check" CHECK ("status" in ('active', 'inactive')),
	CONSTRAINT "fleet_vehicles_capacity_check" CHECK ("tare_weight_kg" >= 0 and "capacity_kg" >= 0 and "capacity_m3" >= 0),
	CONSTRAINT "fleet_vehicles_wheel_type_check" CHECK (("role" = 'traction') = ("wheel_type" in ('01', '02', '03', '04', '05', '06'))),
	CONSTRAINT "fleet_vehicles_body_type_check" CHECK ("body_type" in ('00', '01', '02', '03', '04', '05')),
	CONSTRAINT "fleet_vehicles_state_check" CHECK ("state" ~ '^[A-Z]{2}$' and (length("owner_state") = 0 or "owner_state" ~ '^[A-Z]{2}$')),
	CONSTRAINT "fleet_vehicles_ownership_check" CHECK ("ownership" in ('own', 'aggregate', 'third_party')),
	CONSTRAINT "fleet_vehicles_owner_check" CHECK (case when "ownership" = 'own' then length("owner_tax_id") = 0 and length("owner_name") = 0 and length("owner_state") = 0 and length("owner_rntrc") = 0 and length("owner_tax_regime") = 0 else length("owner_tax_id") > 0 and length("owner_name") > 0 and length("owner_state") > 0 and length("owner_rntrc") > 0 and length("owner_tax_regime") > 0 end),
	CONSTRAINT "fleet_vehicles_owner_tax_id_check" CHECK (length("owner_tax_id") = 0 or "owner_tax_id" ~ '^[0-9]{11}$' or "owner_tax_id" ~ '^[0-9]{14}$'),
	CONSTRAINT "fleet_vehicles_owner_rntrc_check" CHECK (length("owner_rntrc") = 0 or "owner_rntrc" ~ '^[0-9]{8}$'),
	CONSTRAINT "fleet_vehicles_owner_tax_regime_check" CHECK (length("owner_tax_regime") = 0 or "owner_tax_regime" in ('0', '1', '2')),
	CONSTRAINT "fleet_vehicles_version_check" CHECK ("version" > 0)
);
--> statement-breakpoint
ALTER TABLE "user_company_memberships" ADD CONSTRAINT "user_company_memberships_id_company_id_unique" UNIQUE("id","company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fleet_driver_vehicle_assignments_live_vehicle_unique" ON "fleet_driver_vehicle_assignments" ("company_id","vehicle_id") WHERE "released_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "fleet_driver_vehicle_assignments_live_driver_unique" ON "fleet_driver_vehicle_assignments" ("company_id","driver_id") WHERE "released_at" is null;--> statement-breakpoint
CREATE INDEX "fleet_driver_vehicle_assignments_company_driver_assigned_at_idx" ON "fleet_driver_vehicle_assignments" ("company_id","driver_id","assigned_at");--> statement-breakpoint
CREATE UNIQUE INDEX "fleet_drivers_company_membership_unique" ON "fleet_drivers" ("company_id","membership_id") WHERE "membership_id" is not null;--> statement-breakpoint
CREATE INDEX "fleet_drivers_company_status_name_idx" ON "fleet_drivers" ("company_id","status","name");--> statement-breakpoint
CREATE INDEX "fleet_vehicles_company_status_plate_idx" ON "fleet_vehicles" ("company_id","status","plate");--> statement-breakpoint
ALTER TABLE "fleet_driver_vehicle_assignments" ADD CONSTRAINT "fleet_driver_vehicle_assignments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "fleet_driver_vehicle_assignments" ADD CONSTRAINT "fleet_driver_vehicle_assignments_company_driver_fk" FOREIGN KEY ("company_id","driver_id") REFERENCES "fleet_drivers"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "fleet_driver_vehicle_assignments" ADD CONSTRAINT "fleet_driver_vehicle_assignments_company_vehicle_fk" FOREIGN KEY ("company_id","vehicle_id") REFERENCES "fleet_vehicles"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD CONSTRAINT "fleet_drivers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD CONSTRAINT "fleet_drivers_company_membership_fk" FOREIGN KEY ("membership_id","company_id") REFERENCES "user_company_memberships"("id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "fleet_vehicles" ADD CONSTRAINT "fleet_vehicles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;