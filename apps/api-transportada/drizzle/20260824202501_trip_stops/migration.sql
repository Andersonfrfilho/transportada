CREATE TABLE "trip_stops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"sequence" bigint NOT NULL,
	"address_key" text NOT NULL,
	"label" text NOT NULL,
	"arrived_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"delivery_window_start" timestamp with time zone,
	"delivery_window_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_stops_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "trip_stops_company_trip_sequence_unique" UNIQUE("company_id","trip_id","sequence"),
	CONSTRAINT "trip_stops_sequence_check" CHECK ("sequence" >= 1),
	CONSTRAINT "trip_stops_address_key_check" CHECK (length("address_key") > 0),
	CONSTRAINT "trip_stops_label_check" CHECK (length("label") > 0),
	CONSTRAINT "trip_stops_delivery_window_check" CHECK (("delivery_window_start" is null) = ("delivery_window_end" is null)),
	CONSTRAINT "trip_stops_completed_requires_arrived_check" CHECK ("completed_at" is null or "arrived_at" is not null)
);
--> statement-breakpoint
CREATE INDEX "trip_stops_company_trip_idx" ON "trip_stops" ("company_id","trip_id");--> statement-breakpoint
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_company_trip_fk" FOREIGN KEY ("company_id","trip_id") REFERENCES "trips"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;