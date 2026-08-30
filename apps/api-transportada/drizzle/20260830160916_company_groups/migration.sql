CREATE TABLE "company_group_permissions" (
	"group_id" uuid,
	"permission" text,
	CONSTRAINT "company_group_permissions_pk" PRIMARY KEY("group_id","permission"),
	CONSTRAINT "company_group_permissions_not_blank_check" CHECK (length(btrim("permission")) > 0)
);
--> statement-breakpoint
CREATE TABLE "company_group_roles" (
	"group_id" uuid,
	"role" text,
	CONSTRAINT "company_group_roles_pk" PRIMARY KEY("group_id","role"),
	CONSTRAINT "company_group_roles_role_check" CHECK ("role" in ('company-admin', 'finance', 'fiscal', 'operator', 'viewer', 'driver', 'aggregate', 'separator', 'contractor', 'automation'))
);
--> statement-breakpoint
CREATE TABLE "company_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"keycloak_group_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_groups_company_id_name_unique" UNIQUE("company_id","name"),
	CONSTRAINT "company_groups_name_not_blank_check" CHECK (length(btrim("name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "membership_groups" (
	"membership_id" uuid,
	"group_id" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_groups_pk" PRIMARY KEY("membership_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "membership_permissions" (
	"membership_id" uuid,
	"permission" text,
	"granted_by_user_id" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_permissions_pk" PRIMARY KEY("membership_id","permission"),
	CONSTRAINT "membership_permissions_not_blank_check" CHECK (length(btrim("permission")) > 0)
);
--> statement-breakpoint
CREATE INDEX "membership_groups_group_id_idx" ON "membership_groups" ("group_id");--> statement-breakpoint
ALTER TABLE "company_group_permissions" ADD CONSTRAINT "company_group_permissions_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "company_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_group_roles" ADD CONSTRAINT "company_group_roles_group_id_company_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "company_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_groups" ADD CONSTRAINT "company_groups_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "membership_groups" ADD CONSTRAINT "membership_groups_membership_id_fk" FOREIGN KEY ("membership_id") REFERENCES "user_company_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "membership_groups" ADD CONSTRAINT "membership_groups_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "company_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "membership_permissions" ADD CONSTRAINT "membership_permissions_membership_id_fk" FOREIGN KEY ("membership_id") REFERENCES "user_company_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;