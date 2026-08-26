CREATE TABLE "geocoded_addresses" (
	"address_key" text PRIMARY KEY,
	"latitude" numeric(10,7) NOT NULL,
	"longitude" numeric(10,7) NOT NULL,
	"external_place_id" text DEFAULT '' NOT NULL,
	"source" text NOT NULL,
	"precision" text NOT NULL,
	"geocoded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "geocoded_addresses_address_key_check" CHECK (length("address_key") > 0),
	CONSTRAINT "geocoded_addresses_source_check" CHECK ("source" in ('manual', 'google', 'postal_code', 'city')),
	CONSTRAINT "geocoded_addresses_precision_check" CHECK ("precision" in ('rooftop', 'street', 'postal_code', 'city')),
	CONSTRAINT "geocoded_addresses_latitude_check" CHECK ("latitude" between -90 and 90),
	CONSTRAINT "geocoded_addresses_longitude_check" CHECK ("longitude" between -180 and 180),
	CONSTRAINT "geocoded_addresses_place_id_check" CHECK ("source" <> 'google' or length("external_place_id") > 0)
);
--> statement-breakpoint
CREATE TABLE "company_route_optimization_settings" (
	"company_id" uuid PRIMARY KEY,
	"origin_address_key" text DEFAULT '' NOT NULL,
	"end_policy" text DEFAULT 'depot' NOT NULL,
	"end_address_key" text DEFAULT '' NOT NULL,
	"solver_time_budget_seconds" bigint DEFAULT 30 NOT NULL,
	"fallback_average_speed_kph" bigint DEFAULT 30 NOT NULL,
	"default_service_time_seconds" bigint DEFAULT 600 NOT NULL,
	"fallback_weight_kilograms" numeric(12,2) DEFAULT '0.00' NOT NULL,
	"service_time_minimum_samples" bigint DEFAULT 5 NOT NULL,
	"max_driving_seconds_per_day" bigint,
	"mandatory_break_seconds" bigint,
	"break_every_seconds" bigint,
	"max_duty_seconds_per_day" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_route_optimization_settings_end_policy_check" CHECK ("end_policy" in ('depot', 'last_stop', 'address')),
	CONSTRAINT "company_route_optimization_settings_end_address_check" CHECK (("end_policy" = 'address') = (length("end_address_key") > 0)),
	CONSTRAINT "company_route_optimization_settings_budget_check" CHECK ("solver_time_budget_seconds" between 1 and 600),
	CONSTRAINT "company_route_optimization_settings_speed_check" CHECK ("fallback_average_speed_kph" between 1 and 200),
	CONSTRAINT "company_route_optimization_settings_service_time_check" CHECK ("default_service_time_seconds" >= 0 and "service_time_minimum_samples" >= 1),
	CONSTRAINT "company_route_optimization_settings_weight_check" CHECK ("fallback_weight_kilograms" >= 0),
	CONSTRAINT "company_route_optimization_settings_break_check" CHECK (("mandatory_break_seconds" is null) = ("break_every_seconds" is null) and ("mandatory_break_seconds" is null or ("mandatory_break_seconds" > 0 and "break_every_seconds" > 0))),
	CONSTRAINT "company_route_optimization_settings_duty_check" CHECK (("max_driving_seconds_per_day" is null or "max_driving_seconds_per_day" > 0) and ("max_duty_seconds_per_day" is null or "max_duty_seconds_per_day" > 0))
);
--> statement-breakpoint
CREATE TABLE "route_suggestion_stops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"suggestion_id" uuid NOT NULL,
	"stop_id" uuid,
	"sequence" bigint NOT NULL,
	"address_key" text NOT NULL,
	"label" text NOT NULL,
	"geocoding_precision" text,
	"excluded_from_optimization" boolean DEFAULT false NOT NULL,
	"estimated_arrival_at" timestamp with time zone,
	"distance_from_previous_meters" bigint,
	"duration_from_previous_seconds" bigint,
	"service_time_seconds" bigint,
	"service_time_source" text,
	"service_time_sample_size" bigint,
	"weight_estimated" boolean DEFAULT false NOT NULL,
	"violations" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "route_suggestion_stops_company_suggestion_sequence_unique" UNIQUE("company_id","suggestion_id","sequence"),
	CONSTRAINT "route_suggestion_stops_sequence_check" CHECK ("sequence" >= 1),
	CONSTRAINT "route_suggestion_stops_address_key_check" CHECK (length("address_key") > 0),
	CONSTRAINT "route_suggestion_stops_precision_check" CHECK ("geocoding_precision" is null or "geocoding_precision" in ('rooftop', 'street', 'postal_code', 'city')),
	CONSTRAINT "route_suggestion_stops_service_time_check" CHECK (("service_time_seconds" is null) = ("service_time_source" is null) and ("service_time_source" is null or "service_time_source" in ('default', 'measured'))),
	CONSTRAINT "route_suggestion_stops_leg_check" CHECK (("distance_from_previous_meters" is null or "distance_from_previous_meters" >= 0) and ("duration_from_previous_seconds" is null or "duration_from_previous_seconds" >= 0))
);
--> statement-breakpoint
CREATE TABLE "route_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"trip_id" uuid,
	"vehicle_id" uuid,
	"status" text DEFAULT 'queued' NOT NULL,
	"seed" bigint NOT NULL,
	"assumptions" jsonb NOT NULL,
	"estimated_cost_amount" numeric(19,4),
	"estimated_distance_meters" bigint,
	"estimated_duration_seconds" bigint,
	"solver_metrics" jsonb,
	"truncated" boolean DEFAULT false NOT NULL,
	"error_code" text DEFAULT '' NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "route_suggestions_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "route_suggestions_status_check" CHECK ("status" in ('queued', 'running', 'ready', 'accepted', 'rejected', 'failed', 'stale')),
	CONSTRAINT "route_suggestions_decided_check" CHECK (("status" in ('accepted', 'rejected')) = ("decided_at" is not null)),
	CONSTRAINT "route_suggestions_error_code_check" CHECK (("status" = 'failed') = (length("error_code") > 0)),
	CONSTRAINT "route_suggestions_estimates_check" CHECK (("estimated_distance_meters" is null or "estimated_distance_meters" >= 0) and ("estimated_duration_seconds" is null or "estimated_duration_seconds" >= 0) and ("estimated_cost_amount" is null or "estimated_cost_amount" >= 0))
);
--> statement-breakpoint
ALTER TABLE "trip_stops" ADD COLUMN "latitude" numeric(10,7);--> statement-breakpoint
ALTER TABLE "trip_stops" ADD COLUMN "longitude" numeric(10,7);--> statement-breakpoint
ALTER TABLE "trip_stops" ADD COLUMN "geocoding_precision" text;--> statement-breakpoint
ALTER TABLE "trip_stops" ADD COLUMN "estimated_arrival_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trip_stops" ADD COLUMN "distance_from_previous_meters" bigint;--> statement-breakpoint
ALTER TABLE "trip_stops" ADD COLUMN "duration_from_previous_seconds" bigint;--> statement-breakpoint
CREATE INDEX "geocoded_addresses_geocoded_at_idx" ON "geocoded_addresses" ("geocoded_at");--> statement-breakpoint
CREATE INDEX "route_suggestion_stops_company_suggestion_idx" ON "route_suggestion_stops" ("company_id","suggestion_id");--> statement-breakpoint
CREATE INDEX "route_suggestions_company_trip_idx" ON "route_suggestions" ("company_id","trip_id");--> statement-breakpoint
CREATE INDEX "route_suggestions_company_status_idx" ON "route_suggestions" ("company_id","status","created_at");--> statement-breakpoint
ALTER TABLE "company_route_optimization_settings" ADD CONSTRAINT "company_route_optimization_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "route_suggestion_stops" ADD CONSTRAINT "route_suggestion_stops_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "route_suggestion_stops" ADD CONSTRAINT "route_suggestion_stops_company_suggestion_fk" FOREIGN KEY ("company_id","suggestion_id") REFERENCES "route_suggestions"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "route_suggestions" ADD CONSTRAINT "route_suggestions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "route_suggestions" ADD CONSTRAINT "route_suggestions_company_trip_fk" FOREIGN KEY ("company_id","trip_id") REFERENCES "trips"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "route_suggestions" ADD CONSTRAINT "route_suggestions_company_vehicle_fk" FOREIGN KEY ("company_id","vehicle_id") REFERENCES "fleet_vehicles"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_coordinates_check" CHECK (("latitude" is null) = ("longitude" is null) and ("latitude" is null or "geocoding_precision" is not null));--> statement-breakpoint
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_latitude_range_check" CHECK ("latitude" is null or "latitude" between -90 and 90);--> statement-breakpoint
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_longitude_range_check" CHECK ("longitude" is null or "longitude" between -180 and 180);--> statement-breakpoint
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_geocoding_precision_check" CHECK ("geocoding_precision" is null or "geocoding_precision" in ('rooftop', 'street', 'postal_code', 'city'));--> statement-breakpoint
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_leg_check" CHECK (("distance_from_previous_meters" is null or "distance_from_previous_meters" >= 0) and ("duration_from_previous_seconds" is null or "duration_from_previous_seconds" >= 0));