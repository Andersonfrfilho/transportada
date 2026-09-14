CREATE TABLE "trip_document_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"nfe_document_id" uuid NOT NULL,
	"source_trip_id" uuid NOT NULL,
	"source_trip_document_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"layout_id" uuid,
	"input_hash" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"resolution_trip_id" uuid,
	"resolution_trip_document_id" uuid,
	"swapped_review_id" uuid,
	"created_by" uuid NOT NULL,
	"resolved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "trip_document_reviews_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "trip_document_reviews_company_source_trip_document_unique" UNIQUE("company_id","source_trip_document_id"),
	CONSTRAINT "trip_document_reviews_status_check" CHECK ("status" in ('pending', 'moved', 'swapped_in', 'relinked')),
	CONSTRAINT "trip_document_reviews_reason_check" CHECK ("reason" in ('notMeasured', 'largerThanBed', 'bedFull', 'tooMany', 'time_budget', 'swapped_out')),
	CONSTRAINT "trip_document_reviews_resolution_check" CHECK (("status" = 'pending') = ("resolved_at" is null) and ("status" = 'pending') = ("resolution_trip_id" is null)),
	CONSTRAINT "trip_document_reviews_swap_check" CHECK (("status" = 'swapped_in') = ("swapped_review_id" is not null)),
	CONSTRAINT "trip_document_reviews_layout_check" CHECK (("reason" = 'swapped_out') = ("layout_id" is null) and ("layout_id" is null) = ("input_hash" is null))
);
--> statement-breakpoint
ALTER TABLE "trip_document_reviews" ADD CONSTRAINT "trip_document_reviews_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_document_reviews" ADD CONSTRAINT "trip_document_reviews_company_nfe_document_fk" FOREIGN KEY ("company_id","nfe_document_id") REFERENCES "nfe_documents"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_document_reviews" ADD CONSTRAINT "trip_document_reviews_company_source_trip_fk" FOREIGN KEY ("company_id","source_trip_id") REFERENCES "trips"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_document_reviews" ADD CONSTRAINT "trip_document_reviews_company_source_trip_document_fk" FOREIGN KEY ("company_id","source_trip_document_id") REFERENCES "trip_documents"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_document_reviews" ADD CONSTRAINT "trip_document_reviews_company_resolution_trip_fk" FOREIGN KEY ("company_id","resolution_trip_id") REFERENCES "trips"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_document_reviews" ADD CONSTRAINT "trip_document_reviews_company_resolution_trip_document_fk" FOREIGN KEY ("company_id","resolution_trip_document_id") REFERENCES "trip_documents"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_document_reviews" ADD CONSTRAINT "trip_document_reviews_company_swapped_review_fk" FOREIGN KEY ("company_id","swapped_review_id") REFERENCES "trip_document_reviews"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_document_reviews" ADD CONSTRAINT "trip_document_reviews_created_by_membership_fk" FOREIGN KEY ("created_by","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_document_reviews" ADD CONSTRAINT "trip_document_reviews_resolved_by_membership_fk" FOREIGN KEY ("resolved_by","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
CREATE UNIQUE INDEX "trip_document_reviews_pending_nfe_document_unique" ON "trip_document_reviews" ("company_id","nfe_document_id") WHERE "status" = 'pending';--> statement-breakpoint
CREATE INDEX "trip_document_reviews_company_source_trip_status_idx" ON "trip_document_reviews" ("company_id","source_trip_id","status");--> statement-breakpoint
CREATE INDEX "trip_document_reviews_company_layout_idx" ON "trip_document_reviews" ("company_id","layout_id");
