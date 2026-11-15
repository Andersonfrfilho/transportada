CREATE TABLE "integration_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"scopes" text[] NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_api_keys_name_check" CHECK (length(btrim("name")) > 0),
	CONSTRAINT "integration_api_keys_scopes_check" CHECK (cardinality("scopes") > 0 and "scopes" <@ array['quote', 'pickup']::text[])
);
--> statement-breakpoint
ALTER TABLE "pickup_requests" ADD COLUMN "integration_key_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "integration_api_keys_hash_unique" ON "integration_api_keys" ("key_hash");--> statement-breakpoint
CREATE INDEX "integration_api_keys_company_idx" ON "integration_api_keys" ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "pickup_requests_integration_key_idx" ON "pickup_requests" ("integration_key_id","created_at") WHERE "integration_key_id" is not null;--> statement-breakpoint
ALTER TABLE "integration_api_keys" ADD CONSTRAINT "integration_api_keys_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;