CREATE TABLE "cte_emission_profile_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"ordinal" bigint NOT NULL,
	"label" text NOT NULL,
	"calculation_type" text NOT NULL,
	"rate" numeric(9,6),
	"amount" numeric(19,4),
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cte_emission_profile_components_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "cte_emission_profile_components_profile_ordinal_unique" UNIQUE("company_id","profile_id","ordinal"),
	CONSTRAINT "cte_emission_profile_components_calculation_type_check" CHECK ("calculation_type" in ('percentage_of_cargo', 'percentage_of_freight', 'fixed_amount')),
	CONSTRAINT "cte_emission_profile_components_value_coherence_check" CHECK (case when "calculation_type" = 'fixed_amount' then "amount" is not null and "rate" is null else "rate" is not null and "amount" is null end),
	CONSTRAINT "cte_emission_profile_components_rate_check" CHECK ("rate" is null or ("rate" >= 0 and "rate" <= 1)),
	CONSTRAINT "cte_emission_profile_components_amount_check" CHECK ("amount" is null or "amount" >= 0),
	CONSTRAINT "cte_emission_profile_components_validity_check" CHECK ("valid_until" is null or "valid_until" >= "valid_from"),
	CONSTRAINT "cte_emission_profile_components_ordinal_check" CHECK ("ordinal" > 0),
	CONSTRAINT "cte_emission_profile_components_label_check" CHECK (length("label") > 0)
);
--> statement-breakpoint
CREATE TABLE "cte_emission_profile_matchers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"tax_id" text NOT NULL,
	"match_role" text DEFAULT 'sender' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cte_emission_profile_matchers_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "cte_emission_profile_matchers_company_tax_id_role_unique" UNIQUE("company_id","tax_id","match_role"),
	CONSTRAINT "cte_emission_profile_matchers_tax_id_check" CHECK ("tax_id" ~ '^[0-9]{8}$' or "tax_id" ~ '^[0-9]{14}$'),
	CONSTRAINT "cte_emission_profile_matchers_match_role_check" CHECK ("match_role" in ('sender', 'recipient'))
);
--> statement-breakpoint
CREATE TABLE "cte_emission_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"priority" bigint DEFAULT 10 NOT NULL,
	"match_mode" text NOT NULL,
	"grouping_mode" text NOT NULL,
	"freight_rule_id" uuid NOT NULL,
	"taker" text NOT NULL,
	"service_type" text DEFAULT '0' NOT NULL,
	"modal" text DEFAULT '01' NOT NULL,
	"cfop_internal" text NOT NULL,
	"cfop_interstate" text NOT NULL,
	"operation_nature" text NOT NULL,
	"receiver_ie_indicator" text DEFAULT '1' NOT NULL,
	"pickup_indicator" text DEFAULT '1' NOT NULL,
	"predominant_product_mode" text DEFAULT 'highest_value' NOT NULL,
	"predominant_product_name" text DEFAULT '' NOT NULL,
	"delivery_days" bigint DEFAULT 0 NOT NULL,
	"charge_component_label" text NOT NULL,
	"observations" text DEFAULT '' NOT NULL,
	"icms_cst" text NOT NULL,
	"icms_rate" numeric(9,6) DEFAULT '0' NOT NULL,
	"icms_base_reduction_rate" numeric(9,6) DEFAULT '0' NOT NULL,
	"cargo_insurance_declared" boolean DEFAULT true NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cte_emission_profiles_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "cte_emission_profiles_company_id_name_unique" UNIQUE("company_id","name"),
	CONSTRAINT "cte_emission_profiles_status_check" CHECK ("status" in ('draft', 'active', 'inactive')),
	CONSTRAINT "cte_emission_profiles_match_mode_check" CHECK ("match_mode" in ('sender_tax_id', 'manual')),
	CONSTRAINT "cte_emission_profiles_grouping_mode_check" CHECK ("grouping_mode" in ('per_invoice', 'sender_recipient')),
	CONSTRAINT "cte_emission_profiles_taker_check" CHECK ("taker" in ('0', '1', '2', '3')),
	CONSTRAINT "cte_emission_profiles_service_type_check" CHECK ("service_type" in ('0', '1', '2', '3', '4')),
	CONSTRAINT "cte_emission_profiles_modal_check" CHECK ("modal" in ('01', '02', '03', '04', '05')),
	CONSTRAINT "cte_emission_profiles_cfop_check" CHECK ("cfop_internal" ~ '^[0-9]{4}$' and "cfop_interstate" ~ '^[0-9]{4}$'),
	CONSTRAINT "cte_emission_profiles_receiver_ie_indicator_check" CHECK ("receiver_ie_indicator" in ('1', '2', '9')),
	CONSTRAINT "cte_emission_profiles_pickup_indicator_check" CHECK ("pickup_indicator" in ('0', '1')),
	CONSTRAINT "cte_emission_profiles_predominant_product_mode_check" CHECK ("predominant_product_mode" in ('highest_value', 'highest_weight', 'fixed')),
	CONSTRAINT "cte_emission_profiles_predominant_product_check" CHECK (("predominant_product_mode" = 'fixed') = (length("predominant_product_name") > 0)),
	CONSTRAINT "cte_emission_profiles_icms_cst_check" CHECK ("icms_cst" in ('00', '20', '40', '41', '51', '60', '90')),
	CONSTRAINT "cte_emission_profiles_icms_rate_check" CHECK ("icms_rate" >= 0 and "icms_rate" <= 1 and "icms_base_reduction_rate" >= 0 and "icms_base_reduction_rate" <= 1),
	CONSTRAINT "cte_emission_profiles_operation_nature_check" CHECK (length("operation_nature") > 0 and length("operation_nature") <= 60),
	CONSTRAINT "cte_emission_profiles_charge_component_label_check" CHECK (length("charge_component_label") > 0),
	CONSTRAINT "cte_emission_profiles_delivery_days_check" CHECK ("delivery_days" >= 0),
	CONSTRAINT "cte_emission_profiles_priority_check" CHECK ("priority" > 0),
	CONSTRAINT "cte_emission_profiles_version_check" CHECK ("version" > 0),
	CONSTRAINT "cte_emission_profiles_name_check" CHECK (length("name") > 0)
);
--> statement-breakpoint
CREATE INDEX "cte_emission_profile_components_company_profile_valid_from_idx" ON "cte_emission_profile_components" ("company_id","profile_id","valid_from");--> statement-breakpoint
CREATE INDEX "cte_emission_profiles_company_status_priority_idx" ON "cte_emission_profiles" ("company_id","status","priority");--> statement-breakpoint
ALTER TABLE "cte_emission_profile_components" ADD CONSTRAINT "cte_emission_profile_components_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cte_emission_profile_components" ADD CONSTRAINT "cte_emission_profile_components_company_profile_fk" FOREIGN KEY ("company_id","profile_id") REFERENCES "cte_emission_profiles"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cte_emission_profile_matchers" ADD CONSTRAINT "cte_emission_profile_matchers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cte_emission_profile_matchers" ADD CONSTRAINT "cte_emission_profile_matchers_company_profile_fk" FOREIGN KEY ("company_id","profile_id") REFERENCES "cte_emission_profiles"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cte_emission_profiles" ADD CONSTRAINT "cte_emission_profiles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cte_emission_profiles" ADD CONSTRAINT "cte_emission_profiles_company_freight_rule_fk" FOREIGN KEY ("company_id","freight_rule_id") REFERENCES "freight_rules"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cte_emission_profiles" ADD CONSTRAINT "cte_emission_profiles_author_membership_fk" FOREIGN KEY ("created_by_user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;