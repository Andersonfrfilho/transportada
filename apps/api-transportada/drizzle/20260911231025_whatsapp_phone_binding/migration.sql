CREATE TABLE "user_whatsapp_phones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL CONSTRAINT "user_whatsapp_phones_user_id_unique" UNIQUE,
	"phone" text NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_whatsapp_phones_phone_check" CHECK ("phone" ~ '^55[1-9][0-9]{9,10}$')
);
--> statement-breakpoint
CREATE TABLE "whatsapp_phone_verification_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_phone_verification_requests_phone_check" CHECK ("phone" ~ '^55[1-9][0-9]{9,10}$'),
	CONSTRAINT "whatsapp_phone_verification_requests_code_hash_check" CHECK ("code_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "whatsapp_phone_verification_requests_attempt_count_check" CHECK ("attempt_count" between 0 and 5),
	CONSTRAINT "whatsapp_phone_verification_requests_expires_at_check" CHECK ("expires_at" > "created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "user_whatsapp_phones_phone_verified_unique" ON "user_whatsapp_phones" ("phone") WHERE "verified_at" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_phone_verification_requests_company_id_user_id_live_unique" ON "whatsapp_phone_verification_requests" ("company_id","user_id") WHERE "consumed_at" is null;--> statement-breakpoint
CREATE INDEX "whatsapp_phone_verification_requests_company_id_phone_live_idx" ON "whatsapp_phone_verification_requests" ("company_id","phone") WHERE "consumed_at" is null;--> statement-breakpoint
ALTER TABLE "user_whatsapp_phones" ADD CONSTRAINT "user_whatsapp_phones_user_id_identity_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "whatsapp_phone_verification_requests" ADD CONSTRAINT "whatsapp_phone_verification_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "whatsapp_phone_verification_requests" ADD CONSTRAINT "whatsapp_phone_verification_requests_membership_fk" FOREIGN KEY ("user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;
