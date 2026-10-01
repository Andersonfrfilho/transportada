CREATE TABLE "company_occurrence_type_contractor_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"occurrence_type_id" uuid NOT NULL,
	"contractor_id" uuid NOT NULL,
	"attachment_mode" varchar(16) DEFAULT 'optional' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_occurrence_type_contractor_overrides_type_contractor_unique" UNIQUE("company_id","occurrence_type_id","contractor_id"),
	CONSTRAINT "company_occurrence_type_contractor_overrides_attachment_mode_check" CHECK ("attachment_mode" in ('required', 'optional', 'off'))
);
--> statement-breakpoint
CREATE TABLE "company_occurrence_type_recipient_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"occurrence_type_id" uuid NOT NULL,
	"tax_id" text NOT NULL,
	"attachment_mode" varchar(16) DEFAULT 'optional' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_occurrence_type_recipient_overrides_type_tax_id_unique" UNIQUE("company_id","occurrence_type_id","tax_id"),
	CONSTRAINT "company_occurrence_type_recipient_overrides_attachment_mode_check" CHECK ("attachment_mode" in ('required', 'optional', 'off'))
);
--> statement-breakpoint
ALTER TABLE "company_occurrence_type_contractor_overrides" ADD CONSTRAINT "company_occurrence_type_contractor_overrides_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_occurrence_type_contractor_overrides" ADD CONSTRAINT "company_occurrence_type_contractor_overrides_company_id_occurrence_type_id_fk" FOREIGN KEY ("company_id","occurrence_type_id") REFERENCES "company_occurrence_types"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_occurrence_type_contractor_overrides" ADD CONSTRAINT "company_occurrence_type_contractor_overrides_company_id_contractor_id_fk" FOREIGN KEY ("company_id","contractor_id") REFERENCES "contractors"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_occurrence_type_recipient_overrides" ADD CONSTRAINT "company_occurrence_type_recipient_overrides_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_occurrence_type_recipient_overrides" ADD CONSTRAINT "company_occurrence_type_recipient_overrides_company_id_occurrence_type_id_fk" FOREIGN KEY ("company_id","occurrence_type_id") REFERENCES "company_occurrence_types"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_occurrence_type_recipient_overrides" ADD CONSTRAINT "company_occurrence_type_recipient_overrides_company_id_tax_id_fk" FOREIGN KEY ("company_id","tax_id") REFERENCES "delivery_clients"("company_id","tax_id") ON DELETE RESTRICT ON UPDATE CASCADE;