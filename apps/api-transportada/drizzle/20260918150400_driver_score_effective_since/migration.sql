ALTER TABLE "company_delivery_proof_settings" ADD COLUMN "score_effective_since" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
INSERT INTO "company_delivery_proof_settings" ("company_id") SELECT "id" FROM "companies" ON CONFLICT ("company_id") DO NOTHING;
