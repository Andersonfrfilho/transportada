-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Spec 321 T2 (D4): a coleta de canhoto, aditiva. Tabela nova `trip_canhoto_pickups` e a marca do tipo com coleta
-- `creates_canhoto_pickup` (padrão `false`: nenhum tipo passa a criar coleta). Nada toca `trip_documents`: a trava
-- `trip_documents_delivered_locks_release_check` e o vínculo vivo seguem como estão (D3, CA03).
CREATE TABLE "trip_canhoto_pickups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"nfe_document_id" uuid,
	"origin_trip_document_id" uuid NOT NULL,
	"occurrence_id" uuid NOT NULL,
	"pickup_trip_id" uuid,
	"pickup_stop_id" uuid,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"collected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_canhoto_pickups_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "trip_canhoto_pickups_occurrence_unique" UNIQUE("company_id","occurrence_id"),
	CONSTRAINT "trip_canhoto_pickups_status_check" CHECK ("status" in ('pending', 'scheduled', 'collected', 'cancelled')),
	CONSTRAINT "trip_canhoto_pickups_pending_unscheduled_check" CHECK ("status" <> 'pending' or ("pickup_trip_id" is null and "pickup_stop_id" is null)),
	CONSTRAINT "trip_canhoto_pickups_scheduled_trip_check" CHECK ("status" <> 'scheduled' or "pickup_trip_id" is not null),
	CONSTRAINT "trip_canhoto_pickups_stop_needs_trip_check" CHECK ("pickup_stop_id" is null or "pickup_trip_id" is not null),
	CONSTRAINT "trip_canhoto_pickups_collected_at_check" CHECK (("status" = 'collected') = ("collected_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD COLUMN "creates_canhoto_pickup" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "trip_canhoto_pickups_open_origin_unique" ON "trip_canhoto_pickups" ("company_id","origin_trip_document_id") WHERE "status" in ('pending', 'scheduled');--> statement-breakpoint
CREATE INDEX "trip_canhoto_pickups_company_status_idx" ON "trip_canhoto_pickups" ("company_id","status");--> statement-breakpoint
CREATE INDEX "trip_canhoto_pickups_company_nfe_document_idx" ON "trip_canhoto_pickups" ("company_id","nfe_document_id");--> statement-breakpoint
CREATE INDEX "trip_canhoto_pickups_company_pickup_trip_idx" ON "trip_canhoto_pickups" ("company_id","pickup_trip_id");--> statement-breakpoint
CREATE INDEX "trip_canhoto_pickups_company_pickup_stop_idx" ON "trip_canhoto_pickups" ("company_id","pickup_stop_id");--> statement-breakpoint
CREATE INDEX "trip_canhoto_pickups_company_origin_document_idx" ON "trip_canhoto_pickups" ("company_id","origin_trip_document_id");--> statement-breakpoint
ALTER TABLE "trip_canhoto_pickups" ADD CONSTRAINT "trip_canhoto_pickups_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_canhoto_pickups" ADD CONSTRAINT "trip_canhoto_pickups_company_nfe_document_fk" FOREIGN KEY ("company_id","nfe_document_id") REFERENCES "nfe_documents"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_canhoto_pickups" ADD CONSTRAINT "trip_canhoto_pickups_company_origin_document_fk" FOREIGN KEY ("company_id","origin_trip_document_id") REFERENCES "trip_documents"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_canhoto_pickups" ADD CONSTRAINT "trip_canhoto_pickups_company_occurrence_fk" FOREIGN KEY ("company_id","occurrence_id") REFERENCES "trip_document_occurrences"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_canhoto_pickups" ADD CONSTRAINT "trip_canhoto_pickups_company_pickup_trip_fk" FOREIGN KEY ("company_id","pickup_trip_id") REFERENCES "trips"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_canhoto_pickups" ADD CONSTRAINT "trip_canhoto_pickups_company_pickup_stop_fk" FOREIGN KEY ("company_id","pickup_stop_id") REFERENCES "trip_stops"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;