CREATE TABLE "contractor_mail_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"mail_type" text NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"intro" text NOT NULL,
	"item_text" text DEFAULT '' NOT NULL,
	"closing" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contractor_mail_templates_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "contractor_mail_templates_mail_type_check" CHECK ("mail_type" in ('address_correction')),
	CONSTRAINT "contractor_mail_templates_status_check" CHECK ("status" in ('active', 'archived')),
	CONSTRAINT "contractor_mail_templates_name_check" CHECK (length(btrim("name")) > 0 and length("name") <= 120),
	CONSTRAINT "contractor_mail_templates_subject_check" CHECK (length(btrim("subject")) > 0 and length("subject") <= 200 and "subject" !~ '[\r\n]'),
	CONSTRAINT "contractor_mail_templates_intro_check" CHECK (length(btrim("intro")) > 0 and length("intro") <= 4000),
	CONSTRAINT "contractor_mail_templates_item_text_check" CHECK (length("item_text") <= 4000),
	CONSTRAINT "contractor_mail_templates_closing_check" CHECK (length(btrim("closing")) > 0 and length("closing") <= 4000),
	CONSTRAINT "contractor_mail_templates_default_active_check" CHECK (not "is_default" or "status" = 'active'),
	CONSTRAINT "contractor_mail_templates_version_check" CHECK ("version" > 0)
);
--> statement-breakpoint
ALTER TABLE "contractor_mail_messages" ADD COLUMN "template_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "contractor_mail_templates_company_type_name_unique" ON "contractor_mail_templates" ("company_id","mail_type",lower("name")) WHERE "status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "contractor_mail_templates_company_type_default_unique" ON "contractor_mail_templates" ("company_id","mail_type") WHERE "is_default" and "status" = 'active';--> statement-breakpoint
ALTER TABLE "contractor_mail_messages" ADD CONSTRAINT "contractor_mail_messages_template_fk" FOREIGN KEY ("company_id","template_id") REFERENCES "contractor_mail_templates"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "contractor_mail_templates" ADD CONSTRAINT "contractor_mail_templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;