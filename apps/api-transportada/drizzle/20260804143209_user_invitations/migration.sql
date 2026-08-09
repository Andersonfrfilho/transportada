CREATE TABLE "user_invitation_roles" (
	"invitation_id" uuid,
	"company_id" uuid NOT NULL,
	"role" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_invitation_roles_invitation_id_role_pk" PRIMARY KEY("invitation_id","role"),
	CONSTRAINT "user_invitation_roles_role_check" CHECK ("role" in ('company-admin', 'finance', 'fiscal', 'operator', 'viewer', 'driver'))
);
--> statement-breakpoint
CREATE TABLE "user_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL CONSTRAINT "user_invitations_code_hash_unique" UNIQUE,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_invitations_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "user_invitations_status_check" CHECK ("status" in ('pending', 'accepted', 'superseded', 'revoked')),
	CONSTRAINT "user_invitations_code_hash_check" CHECK ("code_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "user_invitations_attempt_count_check" CHECK ("attempt_count" >= 0),
	CONSTRAINT "user_invitations_expires_at_check" CHECK ("expires_at" > "created_at"),
	CONSTRAINT "user_invitations_accepted_at_check" CHECK (("status" = 'accepted') = ("accepted_at" is not null))
);
--> statement-breakpoint
CREATE INDEX "user_invitation_roles_company_id_idx" ON "user_invitation_roles" ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_invitations_company_id_user_id_pending_unique" ON "user_invitations" ("company_id","user_id") WHERE "status" = 'pending';--> statement-breakpoint
CREATE INDEX "user_invitations_company_id_status_idx" ON "user_invitations" ("company_id","status");--> statement-breakpoint
ALTER TABLE "user_invitation_roles" ADD CONSTRAINT "user_invitation_roles_invitation_fk" FOREIGN KEY ("invitation_id","company_id") REFERENCES "user_invitations"("id","company_id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_membership_fk" FOREIGN KEY ("user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;