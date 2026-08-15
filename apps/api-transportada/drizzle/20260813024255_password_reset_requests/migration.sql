CREATE TABLE "password_reset_delivery_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"event_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"event_version" bigint NOT NULL,
	"correlation_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempt" bigint DEFAULT 0 NOT NULL,
	"claim_owner" text,
	"claim_expires_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_delivery_outbox_company_id_event_id_unique" UNIQUE("company_id","event_id"),
	CONSTRAINT "password_reset_delivery_outbox_attempt_check" CHECK ("attempt" >= 0),
	CONSTRAINT "password_reset_delivery_outbox_event_version_check" CHECK ("event_version" > 0),
	CONSTRAINT "password_reset_delivery_outbox_event_type_check" CHECK ("event_type" in ('transportada.identity.password-reset.code.requested')),
	CONSTRAINT "password_reset_delivery_outbox_claim_check" CHECK (("claim_owner" is null) = ("claim_expires_at" is null))
);
--> statement-breakpoint
CREATE TABLE "password_reset_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL CONSTRAINT "password_reset_requests_code_hash_unique" UNIQUE,
	"sealed_code" jsonb NOT NULL,
	"delivered_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_requests_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "password_reset_requests_code_hash_check" CHECK ("code_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "password_reset_requests_attempt_count_check" CHECK ("attempt_count" >= 0),
	CONSTRAINT "password_reset_requests_expires_at_check" CHECK ("expires_at" > "created_at")
);
--> statement-breakpoint
CREATE INDEX "password_reset_delivery_outbox_pending_idx" ON "password_reset_delivery_outbox" ("published_at","next_attempt_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_requests_company_id_user_id_live_unique" ON "password_reset_requests" ("company_id","user_id") WHERE "consumed_at" is null;--> statement-breakpoint
CREATE INDEX "password_reset_requests_expires_at_idx" ON "password_reset_requests" ("expires_at");--> statement-breakpoint
ALTER TABLE "password_reset_delivery_outbox" ADD CONSTRAINT "password_reset_delivery_outbox_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "password_reset_delivery_outbox" ADD CONSTRAINT "password_reset_delivery_outbox_request_fk" FOREIGN KEY ("request_id","company_id") REFERENCES "password_reset_requests"("id","company_id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "password_reset_requests" ADD CONSTRAINT "password_reset_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "password_reset_requests" ADD CONSTRAINT "password_reset_requests_membership_fk" FOREIGN KEY ("user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;