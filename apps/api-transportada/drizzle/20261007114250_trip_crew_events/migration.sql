-- Copyright (c) 2026 Ada Technology. MIT License.
-- Spec 249 D6: o histórico das transferências de tripulação de uma viagem que já saiu. Aditiva: uma tabela
-- nova, append-only por trigger (no molde de `trip_dispatch_snapshots`), nenhuma linha existente muda.
CREATE TABLE "trip_crew_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"channel" varchar(16) NOT NULL,
	"reason" text NOT NULL,
	"previous_crew" jsonb NOT NULL,
	"next_crew" jsonb NOT NULL,
	"cost_before" numeric(14,2) NOT NULL,
	"cost_after" numeric(14,2) NOT NULL,
	"cost_difference" numeric(14,2) NOT NULL,
	"cost_has_gaps" boolean NOT NULL,
	"mdfe_driver_divergence" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_crew_events_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "trip_crew_events_channel_check" CHECK ("channel" in ('driver_app', 'office', 'whatsapp', 'backoffice')),
	CONSTRAINT "trip_crew_events_reason_check" CHECK (char_length("reason") between 1 and 500),
	CONSTRAINT "trip_crew_events_crew_shape_check" CHECK (jsonb_typeof("previous_crew") = 'array' and jsonb_typeof("next_crew") = 'array' and jsonb_array_length("next_crew") >= 1),
	CONSTRAINT "trip_crew_events_cost_difference_check" CHECK ("cost_difference" = "cost_after" - "cost_before")
);
--> statement-breakpoint
CREATE INDEX "trip_crew_events_company_trip_created_at_idx" ON "trip_crew_events" ("company_id","trip_id","created_at");--> statement-breakpoint
ALTER TABLE "trip_crew_events" ADD CONSTRAINT "trip_crew_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_crew_events" ADD CONSTRAINT "trip_crew_events_company_trip_fk" FOREIGN KEY ("company_id","trip_id") REFERENCES "trips"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
CREATE FUNCTION "reject_trip_crew_events_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'trip_crew_events is append-only' USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "trip_crew_events_append_only_trigger"
BEFORE UPDATE OR DELETE ON "trip_crew_events"
FOR EACH ROW
EXECUTE FUNCTION "reject_trip_crew_events_mutation"();
