CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_status_check" CHECK ("status" in ('active', 'disabled'))
);
--> statement-breakpoint
CREATE TABLE "external_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_identities_issuer_subject_unique" UNIQUE("issuer","subject"),
	CONSTRAINT "external_identities_issuer_subject_not_blank_check" CHECK ("issuer" ~ U&'[^[:space:]\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF]' and "subject" ~ U&'[^[:space:]\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF]')
);
--> statement-breakpoint
CREATE TABLE "identity_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identity_users_status_check" CHECK ("status" in ('active', 'disabled'))
);
--> statement-breakpoint
CREATE TABLE "membership_roles" (
	"membership_id" uuid,
	"role" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_roles_membership_id_role_pk" PRIMARY KEY("membership_id","role"),
	CONSTRAINT "membership_roles_role_check" CHECK ("role" in ('company-admin', 'finance', 'fiscal', 'operator', 'viewer'))
);
--> statement-breakpoint
CREATE TABLE "user_company_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_company_memberships_user_company_unique" UNIQUE("user_id","company_id"),
	CONSTRAINT "user_company_memberships_status_check" CHECK ("status" in ('active', 'disabled'))
);
--> statement-breakpoint
CREATE INDEX "external_identities_user_id_idx" ON "external_identities" ("user_id");--> statement-breakpoint
CREATE INDEX "user_company_memberships_company_id_idx" ON "user_company_memberships" ("company_id");--> statement-breakpoint
CREATE INDEX "user_company_memberships_user_id_idx" ON "user_company_memberships" ("user_id");--> statement-breakpoint
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_user_id_identity_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_membership_id_user_company_memberships_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "user_company_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "user_company_memberships" ADD CONSTRAINT "user_company_memberships_user_id_identity_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "user_company_memberships" ADD CONSTRAINT "user_company_memberships_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;