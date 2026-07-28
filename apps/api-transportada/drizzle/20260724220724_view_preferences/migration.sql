CREATE TABLE "view_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"view_key" text NOT NULL,
	"preferences" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "view_preferences_company_user_view_key_unique" UNIQUE("company_id","user_id","view_key"),
	CONSTRAINT "view_preferences_view_key_not_blank_check" CHECK (length(trim("view_key")) > 0)
);
--> statement-breakpoint
CREATE INDEX "view_preferences_company_user_idx" ON "view_preferences" ("company_id","user_id");--> statement-breakpoint
ALTER TABLE "view_preferences" ADD CONSTRAINT "view_preferences_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "view_preferences" ADD CONSTRAINT "view_preferences_user_id_identity_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "view_preferences" ADD CONSTRAINT "view_preferences_membership_fk" FOREIGN KEY ("user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;