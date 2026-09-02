CREATE TABLE "geocoding_refinement_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"address_key" text NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"outcome" text NOT NULL,
	"precision" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "geocoding_refinement_requests_address_key_check" CHECK (length("address_key") > 0),
	CONSTRAINT "geocoding_refinement_requests_outcome_check" CHECK ("outcome" in ('refined', 'not_improved', 'provider_not_configured')),
	CONSTRAINT "geocoding_refinement_requests_precision_check" CHECK ("precision" is null or "precision" in ('rooftop', 'street', 'postal_code', 'city'))
);
--> statement-breakpoint
CREATE INDEX "geocoding_refinement_requests_company_created_idx" ON "geocoding_refinement_requests" ("company_id","created_at");--> statement-breakpoint
ALTER TABLE "geocoding_refinement_requests" ADD CONSTRAINT "geocoding_refinement_requests_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;