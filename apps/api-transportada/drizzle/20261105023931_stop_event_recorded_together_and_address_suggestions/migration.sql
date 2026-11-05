-- Spec 294 T2.1 (ADR-0113): recorded_together, sugestões de endereço e 'driver' como fonte de coordenada. Aditiva: coluna com default, tabela nova e CHECKs alargados.
CREATE TABLE "address_correction_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"address_key" text NOT NULL,
	"trip_stop_id" uuid,
	"trip_stop_event_id" uuid,
	"latitude" numeric(10,7) NOT NULL,
	"longitude" numeric(10,7) NOT NULL,
	"distance_meters" integer,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "address_correction_suggestions_status_check" CHECK ("status" in ('pending', 'applied', 'dismissed')),
	CONSTRAINT "address_correction_suggestions_decided_check" CHECK (("status" = 'pending') = ("decided_at" is null)),
	CONSTRAINT "address_correction_suggestions_distance_check" CHECK ("distance_meters" is null or "distance_meters" >= 0),
	CONSTRAINT "address_correction_suggestions_latitude_check" CHECK ("latitude" between -90 and 90),
	CONSTRAINT "address_correction_suggestions_longitude_check" CHECK ("longitude" between -180 and 180)
);
--> statement-breakpoint
ALTER TABLE "trip_stop_events" ADD COLUMN "recorded_together" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "address_correction_suggestions_company_status_created_idx" ON "address_correction_suggestions" ("company_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "address_correction_suggestions_company_event_unique" ON "address_correction_suggestions" ("company_id","trip_stop_event_id") WHERE "trip_stop_event_id" is not null;--> statement-breakpoint
ALTER TABLE "address_correction_suggestions" ADD CONSTRAINT "address_correction_suggestions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "address_correction_suggestions" ADD CONSTRAINT "address_correction_suggestions_address_key_fk" FOREIGN KEY ("address_key") REFERENCES "geocoded_addresses"("address_key") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "address_correction_suggestions" ADD CONSTRAINT "address_correction_suggestions_trip_stop_id_fk" FOREIGN KEY ("trip_stop_id") REFERENCES "trip_stops"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "address_correction_suggestions" ADD CONSTRAINT "address_correction_suggestions_trip_stop_event_id_fk" FOREIGN KEY ("trip_stop_event_id") REFERENCES "trip_stop_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "address_correction_suggestions" ADD CONSTRAINT "address_correction_suggestions_created_by_membership_fk" FOREIGN KEY ("created_by_user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "address_correction_suggestions" ADD CONSTRAINT "address_correction_suggestions_decided_by_membership_fk" FOREIGN KEY ("decided_by_user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "geocoded_addresses" DROP CONSTRAINT "geocoded_addresses_source_check", ADD CONSTRAINT "geocoded_addresses_source_check" CHECK ("source" in ('manual', 'driver', 'google', 'postal_code', 'city'));--> statement-breakpoint
ALTER TABLE "geocoded_address_corrections" DROP CONSTRAINT "geocoded_address_corrections_previous_source_check", ADD CONSTRAINT "geocoded_address_corrections_previous_source_check" CHECK ("previous_source" is null or "previous_source" in ('manual', 'driver', 'google', 'postal_code', 'city'));--> statement-breakpoint
ALTER TABLE "geocoded_address_corrections" DROP CONSTRAINT "geocoded_address_corrections_new_source_check", ADD CONSTRAINT "geocoded_address_corrections_new_source_check" CHECK ("new_source" in ('manual', 'driver', 'google', 'postal_code', 'city'));--> statement-breakpoint
ALTER TABLE "client_delivery_addresses" DROP CONSTRAINT "client_delivery_addresses_source_check", ADD CONSTRAINT "client_delivery_addresses_source_check" CHECK ("source" in ('manual', 'driver', 'google', 'postal_code', 'city'));