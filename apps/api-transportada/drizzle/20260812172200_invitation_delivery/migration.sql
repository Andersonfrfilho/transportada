CREATE TABLE "invitation_delivery_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"event_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"invitation_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"event_version" bigint NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"correlation_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempt" bigint DEFAULT 0 NOT NULL,
	"claim_owner" text,
	"claim_expires_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_delivery_outbox_company_id_event_id_unique" UNIQUE("company_id","event_id"),
	CONSTRAINT "invitation_delivery_outbox_attempt_check" CHECK ("attempt" >= 0),
	CONSTRAINT "invitation_delivery_outbox_event_version_check" CHECK ("event_version" > 0),
	CONSTRAINT "invitation_delivery_outbox_event_type_check" CHECK ("event_type" in ('transportada.identity.invitation.code.requested')),
	CONSTRAINT "invitation_delivery_outbox_claim_check" CHECK (("claim_owner" is null) = ("claim_expires_at" is null))
);
--> statement-breakpoint
ALTER TABLE "user_invitations" ADD COLUMN "sealed_code" jsonb;--> statement-breakpoint
ALTER TABLE "user_invitations" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "invitation_delivery_outbox_pending_idx" ON "invitation_delivery_outbox" ("published_at","next_attempt_at","created_at");--> statement-breakpoint
ALTER TABLE "invitation_delivery_outbox" ADD CONSTRAINT "invitation_delivery_outbox_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "invitation_delivery_outbox" ADD CONSTRAINT "invitation_delivery_outbox_invitation_fk" FOREIGN KEY ("invitation_id","company_id") REFERENCES "user_invitations"("id","company_id") ON DELETE CASCADE ON UPDATE CASCADE;