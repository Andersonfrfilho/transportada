CREATE TABLE "contractor_receiving_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"contractor_id" uuid NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"separation_window_hours" smallint,
	"delivery_deadline_business_days" smallint,
	"match_window_days" smallint DEFAULT 15 NOT NULL,
	"weight_tolerance_percent" numeric(5,2) DEFAULT '0' NOT NULL,
	"preview_enabled" boolean DEFAULT false NOT NULL,
	"preview_sheet_name" text,
	"preview_column_map" jsonb,
	"arrival_reference_pattern" text,
	"requires_damage_check" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contractor_receiving_profiles_company_contractor_unique" UNIQUE("company_id","contractor_id"),
	CONSTRAINT "contractor_receiving_profiles_separation_window_hours_check" CHECK ("separation_window_hours" between 1 and 168),
	CONSTRAINT "contractor_receiving_profiles_delivery_deadline_business_days_check" CHECK ("delivery_deadline_business_days" between 1 and 60),
	CONSTRAINT "contractor_receiving_profiles_match_window_days_check" CHECK ("match_window_days" between 1 and 60),
	CONSTRAINT "contractor_receiving_profiles_weight_tolerance_percent_check" CHECK ("weight_tolerance_percent" between 0 and 100),
	CONSTRAINT "contractor_receiving_profiles_preview_sheet_name_check" CHECK (char_length("preview_sheet_name") between 1 and 31),
	CONSTRAINT "contractor_receiving_profiles_preview_column_map_check" CHECK (jsonb_typeof("preview_column_map") = 'object'),
	CONSTRAINT "contractor_receiving_profiles_preview_requires_column_map_check" CHECK (not "preview_enabled" or "preview_column_map" is not null),
	CONSTRAINT "contractor_receiving_profiles_arrival_reference_pattern_check" CHECK (char_length("arrival_reference_pattern") between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "contractor_receiving_profiles" ADD CONSTRAINT "contractor_receiving_profiles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "contractor_receiving_profiles" ADD CONSTRAINT "contractor_receiving_profiles_company_id_contractor_id_contractors_company_id_id_fk" FOREIGN KEY ("company_id","contractor_id") REFERENCES "contractors"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;