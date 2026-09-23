CREATE TABLE "trip_occurrence_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"bucket" text NOT NULL,
	"object_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"declared_size_bytes" bigint NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_occurrence_uploads_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "trip_occurrence_uploads_status_check" CHECK ("status" in ('pending', 'confirmed', 'expired')),
	CONSTRAINT "trip_occurrence_uploads_declared_size_check" CHECK ("declared_size_bytes" > 0),
	CONSTRAINT "trip_occurrence_uploads_confirmed_check" CHECK (("status" = 'confirmed') = ("confirmed_at" is not null))
);
--> statement-breakpoint
CREATE INDEX "trip_occurrence_uploads_company_trip_idx" ON "trip_occurrence_uploads" ("company_id","trip_id");--> statement-breakpoint
ALTER TABLE "trip_occurrence_uploads" ADD CONSTRAINT "trip_occurrence_uploads_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_occurrence_uploads" ADD CONSTRAINT "trip_occurrence_uploads_company_trip_fk" FOREIGN KEY ("company_id","trip_id") REFERENCES "trips"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;