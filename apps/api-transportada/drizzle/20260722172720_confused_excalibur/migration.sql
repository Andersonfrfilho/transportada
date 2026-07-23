CREATE TABLE "freight_calculations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"nfe_document_id" uuid NOT NULL,
	"freight_rule_id" uuid NOT NULL,
	"freight_rule_version_id" uuid NOT NULL,
	"rule_version" bigint NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"status" text NOT NULL,
	"base_amount" numeric(19,4) NOT NULL,
	"percentage" numeric(9,6) NOT NULL,
	"calculated_amount" numeric(19,4) NOT NULL,
	"minimum_amount" numeric(19,4),
	"maximum_amount" numeric(19,4),
	"total_amount" numeric(19,4) NOT NULL,
	"adjustments" jsonb NOT NULL,
	"rule_snapshot" jsonb NOT NULL,
	"calculation_details" jsonb NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"correlation_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "freight_calculations_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "freight_calculations_company_id_idempotency_key_unique" UNIQUE("company_id","idempotency_key"),
	CONSTRAINT "freight_calculations_status_check" CHECK ("status" in ('snapshotted', 'rejected')),
	CONSTRAINT "freight_calculations_rule_version_check" CHECK ("rule_version" > 0),
	CONSTRAINT "freight_calculations_percentage_check" CHECK ("percentage" >= 0 and "percentage" <= 1),
	CONSTRAINT "freight_calculations_amounts_check" CHECK ("base_amount" >= 0 and "calculated_amount" >= 0 and "total_amount" >= 0 and ("minimum_amount" is null or "minimum_amount" >= 0) and ("maximum_amount" is null or "maximum_amount" >= 0) and ("minimum_amount" is null or "maximum_amount" is null or "minimum_amount" <= "maximum_amount"))
);
--> statement-breakpoint
CREATE TABLE "freight_rule_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"freight_rule_id" uuid NOT NULL,
	"version" bigint NOT NULL,
	"status" text NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone,
	"percentage" numeric(9,6) NOT NULL,
	"minimum_amount" numeric(19,4),
	"maximum_amount" numeric(19,4),
	"filters" jsonb NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "freight_rule_versions_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "freight_rule_versions_company_rule_version_unique" UNIQUE("company_id","freight_rule_id","version"),
	CONSTRAINT "freight_rule_versions_status_check" CHECK ("status" in ('draft', 'active', 'inactive')),
	CONSTRAINT "freight_rule_versions_version_check" CHECK ("version" > 0),
	CONSTRAINT "freight_rule_versions_percentage_check" CHECK ("percentage" >= 0 and "percentage" <= 1),
	CONSTRAINT "freight_rule_versions_amounts_check" CHECK (("minimum_amount" is null or "minimum_amount" >= 0) and ("maximum_amount" is null or "maximum_amount" >= 0) and ("minimum_amount" is null or "maximum_amount" is null or "minimum_amount" <= "maximum_amount")),
	CONSTRAINT "freight_rule_versions_validity_check" CHECK ("valid_until" is null or "valid_until" >= "valid_from")
);
--> statement-breakpoint
CREATE TABLE "freight_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"priority" bigint NOT NULL,
	"current_version" bigint NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "freight_rules_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "freight_rules_company_id_name_unique" UNIQUE("company_id","name"),
	CONSTRAINT "freight_rules_type_check" CHECK ("type" in ('percentage_of_invoice_total')),
	CONSTRAINT "freight_rules_status_check" CHECK ("status" in ('draft', 'active', 'inactive')),
	CONSTRAINT "freight_rules_priority_check" CHECK ("priority" > 0),
	CONSTRAINT "freight_rules_current_version_check" CHECK ("current_version" > 0)
);
--> statement-breakpoint
CREATE INDEX "freight_calculations_company_nfe_created_at_idx" ON "freight_calculations" ("company_id","nfe_document_id","created_at");--> statement-breakpoint
CREATE INDEX "freight_rule_versions_company_rule_validity_idx" ON "freight_rule_versions" ("company_id","freight_rule_id","status","valid_from","valid_until");--> statement-breakpoint
CREATE INDEX "freight_rules_company_id_status_type_priority_idx" ON "freight_rules" ("company_id","status","type","priority");--> statement-breakpoint
ALTER TABLE "freight_calculations" ADD CONSTRAINT "freight_calculations_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "freight_calculations" ADD CONSTRAINT "freight_calculations_company_nfe_document_fk" FOREIGN KEY ("company_id","nfe_document_id") REFERENCES "nfe_documents"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "freight_calculations" ADD CONSTRAINT "freight_calculations_company_rule_fk" FOREIGN KEY ("company_id","freight_rule_id") REFERENCES "freight_rules"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "freight_calculations" ADD CONSTRAINT "freight_calculations_company_rule_version_fk" FOREIGN KEY ("company_id","freight_rule_id","rule_version") REFERENCES "freight_rule_versions"("company_id","freight_rule_id","version") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "freight_calculations" ADD CONSTRAINT "freight_calculations_company_rule_version_id_fk" FOREIGN KEY ("company_id","freight_rule_version_id") REFERENCES "freight_rule_versions"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "freight_calculations" ADD CONSTRAINT "freight_calculations_created_by_membership_fk" FOREIGN KEY ("created_by_user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "freight_rule_versions" ADD CONSTRAINT "freight_rule_versions_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "freight_rule_versions" ADD CONSTRAINT "freight_rule_versions_company_rule_fk" FOREIGN KEY ("company_id","freight_rule_id") REFERENCES "freight_rules"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "freight_rule_versions" ADD CONSTRAINT "freight_rule_versions_created_by_membership_fk" FOREIGN KEY ("created_by_user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "freight_rules" ADD CONSTRAINT "freight_rules_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "freight_rules" ADD CONSTRAINT "freight_rules_created_by_membership_fk" FOREIGN KEY ("created_by_user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;