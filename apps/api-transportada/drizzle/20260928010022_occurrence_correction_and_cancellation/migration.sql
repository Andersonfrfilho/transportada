CREATE TABLE "trip_document_occurrence_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"occurrence_id" uuid NOT NULL,
	"previous_items" jsonb NOT NULL,
	"corrected_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_document_occurrence_corrections_company_id_id_unique" UNIQUE("company_id","id")
);
--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" ADD COLUMN "cancelled_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
CREATE INDEX "trip_document_occurrence_corrections_company_occurrence_idx" ON "trip_document_occurrence_corrections" ("company_id","occurrence_id","created_at");--> statement-breakpoint
ALTER TABLE "trip_document_occurrence_corrections" ADD CONSTRAINT "trip_document_occurrence_corrections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_document_occurrence_corrections" ADD CONSTRAINT "trip_document_occurrence_corrections_company_occurrence_fk" FOREIGN KEY ("company_id","occurrence_id") REFERENCES "trip_document_occurrences"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_document_occurrence_corrections" ADD CONSTRAINT "trip_document_occurrence_corrections_company_corrected_by_fk" FOREIGN KEY ("company_id","corrected_by_user_id") REFERENCES "user_company_memberships"("company_id","user_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" ADD CONSTRAINT "trip_document_occurrences_company_cancelled_by_fk" FOREIGN KEY ("company_id","cancelled_by_user_id") REFERENCES "user_company_memberships"("company_id","user_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" ADD CONSTRAINT "trip_document_occurrences_cancellation_presence_check" CHECK (("cancelled_at" is null) = ("cancelled_by_user_id" is null)
        and ("cancelled_at" is null) = ("cancellation_reason" is null));