-- Copyright (c) 2026 Ada Technology. MIT License.
-- Spec 257 D9: o histórico das notas acrescentadas a uma viagem que já saiu. Aditiva: uma tabela nova,
-- append-only por trigger (no molde de `trip_crew_events`), nenhuma linha existente muda.
CREATE TABLE "trip_document_link_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"channel" varchar(16) NOT NULL,
	"reason" text NOT NULL,
	"nfe_document_ids" jsonb NOT NULL,
	"created_stop_ids" jsonb NOT NULL,
	"mdfe_document_divergence" boolean NOT NULL,
	"documents_without_cte" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_document_link_events_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "trip_document_link_events_channel_check" CHECK ("channel" in ('driver_app', 'office', 'whatsapp', 'backoffice')),
	CONSTRAINT "trip_document_link_events_reason_check" CHECK (char_length("reason") between 1 and 500),
	CONSTRAINT "trip_document_link_events_shape_check" CHECK (jsonb_typeof("nfe_document_ids") = 'array' and jsonb_array_length("nfe_document_ids") >= 1 and jsonb_typeof("created_stop_ids") = 'array'),
	CONSTRAINT "trip_document_link_events_without_cte_check" CHECK ("documents_without_cte" >= 0)
);
--> statement-breakpoint
CREATE INDEX "trip_document_link_events_company_trip_created_at_idx" ON "trip_document_link_events" ("company_id","trip_id","created_at");--> statement-breakpoint
ALTER TABLE "trip_document_link_events" ADD CONSTRAINT "trip_document_link_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_document_link_events" ADD CONSTRAINT "trip_document_link_events_company_trip_fk" FOREIGN KEY ("company_id","trip_id") REFERENCES "trips"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
CREATE FUNCTION "reject_trip_document_link_events_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'trip_document_link_events is append-only' USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "trip_document_link_events_append_only_trigger"
BEFORE UPDATE OR DELETE ON "trip_document_link_events"
FOR EACH ROW
EXECUTE FUNCTION "reject_trip_document_link_events_mutation"();
