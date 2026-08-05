CREATE TABLE "trip_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"nfe_document_id" uuid,
	"freight_calculation_id" uuid,
	"delivered_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_documents_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "trip_documents_entity_xor_check" CHECK (("nfe_document_id" is null) <> ("freight_calculation_id" is null)),
	CONSTRAINT "trip_documents_delivered_locks_release_check" CHECK ("delivered_at" is null or "released_at" is null)
);
--> statement-breakpoint
CREATE TABLE "trip_drivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"driver_name" text NOT NULL,
	"driver_tax_id" text NOT NULL,
	"position" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_drivers_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "trip_drivers_company_trip_driver_unique" UNIQUE("company_id","trip_id","driver_id"),
	CONSTRAINT "trip_drivers_company_trip_position_unique" UNIQUE("company_id","trip_id","position"),
	CONSTRAINT "trip_drivers_position_check" CHECK ("position" between 1 and 10),
	CONSTRAINT "trip_drivers_tax_id_check" CHECK ("driver_tax_id" ~ '^[0-9]{11}$'),
	CONSTRAINT "trip_drivers_name_check" CHECK (length("driver_name") > 0)
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trips_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "trips_status_check" CHECK ("status" in ('open', 'closed'))
);
--> statement-breakpoint
ALTER TABLE "mdfe_manifests" ADD COLUMN "trip_id" uuid;--> statement-breakpoint
CREATE INDEX "trip_documents_company_trip_idx" ON "trip_documents" ("company_id","trip_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trip_documents_live_nfe_document_unique" ON "trip_documents" ("company_id","nfe_document_id") WHERE "released_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "trip_documents_live_freight_calculation_unique" ON "trip_documents" ("company_id","freight_calculation_id") WHERE "released_at" is null;--> statement-breakpoint
CREATE INDEX "trips_company_status_created_at_idx" ON "trips" ("company_id","status","created_at");--> statement-breakpoint
CREATE INDEX "trips_company_vehicle_idx" ON "trips" ("company_id","vehicle_id");--> statement-breakpoint
ALTER TABLE "mdfe_manifests" ADD CONSTRAINT "mdfe_manifests_company_trip_fk" FOREIGN KEY ("company_id","trip_id") REFERENCES "trips"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_documents" ADD CONSTRAINT "trip_documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_documents" ADD CONSTRAINT "trip_documents_company_trip_fk" FOREIGN KEY ("company_id","trip_id") REFERENCES "trips"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_documents" ADD CONSTRAINT "trip_documents_company_nfe_document_fk" FOREIGN KEY ("company_id","nfe_document_id") REFERENCES "nfe_documents"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_documents" ADD CONSTRAINT "trip_documents_company_freight_calculation_fk" FOREIGN KEY ("company_id","freight_calculation_id") REFERENCES "freight_calculations"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_drivers" ADD CONSTRAINT "trip_drivers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_drivers" ADD CONSTRAINT "trip_drivers_company_trip_fk" FOREIGN KEY ("company_id","trip_id") REFERENCES "trips"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_drivers" ADD CONSTRAINT "trip_drivers_company_driver_fk" FOREIGN KEY ("company_id","driver_id") REFERENCES "fleet_drivers"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_company_vehicle_fk" FOREIGN KEY ("company_id","vehicle_id") REFERENCES "fleet_vehicles"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;