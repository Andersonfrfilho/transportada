CREATE TABLE "trip_occurrence_case_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_user_id" uuid,
	"note" text DEFAULT '' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_occurrence_case_events_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "trip_occurrence_case_events_actor_kind_check" CHECK ("actor_kind" in ('internal', 'contractor')),
	CONSTRAINT "trip_occurrence_case_events_from_status_check" CHECK ("from_status" is null or "from_status" in ('recorded', 'under_review', 'returned_to_warehouse', 'awaiting_contractor', 'decided', 'closed')),
	CONSTRAINT "trip_occurrence_case_events_to_status_check" CHECK ("to_status" in ('recorded', 'under_review', 'returned_to_warehouse', 'awaiting_contractor', 'decided', 'closed')),
	CONSTRAINT "trip_occurrence_case_events_transition_check" CHECK ("from_status" is null or "from_status" <> "to_status"),
	CONSTRAINT "trip_occurrence_case_events_terminal_check" CHECK ("from_status" is null or "from_status" not in ('closed','returned_to_warehouse')),
	CONSTRAINT "trip_occurrence_case_events_warehouse_note_check" CHECK ("to_status" <> 'returned_to_warehouse' or length(btrim("note")) > 0)
);
--> statement-breakpoint
CREATE TABLE "trip_occurrence_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"occurrence_id" uuid NOT NULL,
	"status" text NOT NULL,
	"redelivery_policy" text NOT NULL,
	"decision_kind" text,
	"decision_note" text DEFAULT '' NOT NULL,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_occurrence_cases_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "trip_occurrence_cases_occurrence_unique" UNIQUE("company_id","occurrence_id"),
	CONSTRAINT "trip_occurrence_cases_status_check" CHECK ("status" in ('recorded', 'under_review', 'returned_to_warehouse', 'awaiting_contractor', 'decided', 'closed')),
	CONSTRAINT "trip_occurrence_cases_policy_check" CHECK ("redelivery_policy" in ('allowed','blocked')),
	CONSTRAINT "trip_occurrence_cases_decision_check" CHECK (("decision_kind" is null) = ("decided_at" is null)),
	CONSTRAINT "trip_occurrence_cases_decision_kind_check" CHECK ("decision_kind" is null or "decision_kind" in ('redelivery_authorized', 'goods_paid', 'other')),
	CONSTRAINT "trip_occurrence_cases_decided_status_check" CHECK ("status" not in ('decided','closed') or "decision_kind" is not null),
	CONSTRAINT "trip_occurrence_cases_decision_status_check" CHECK ("decision_kind" is null or "status" in ('decided','closed')),
	CONSTRAINT "trip_occurrence_cases_decided_by_check" CHECK (("decided_at" is null) = ("decided_by_user_id" is null)),
	CONSTRAINT "trip_occurrence_cases_decision_note_check" CHECK ("decision_kind" <> 'other' or length(btrim("decision_note")) > 0),
	CONSTRAINT "trip_occurrence_cases_resolved_check" CHECK (("status" in ('closed','returned_to_warehouse')) = ("resolved_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD COLUMN "redelivery_policy" text DEFAULT 'unset' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "trip_occurrence_case_events_opening_unique" ON "trip_occurrence_case_events" ("company_id","case_id") WHERE "from_status" is null;--> statement-breakpoint
CREATE INDEX "trip_occurrence_case_events_company_case_occurred_at_idx" ON "trip_occurrence_case_events" ("company_id","case_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "trip_occurrence_cases_company_status_idx" ON "trip_occurrence_cases" ("company_id","status");--> statement-breakpoint
ALTER TABLE "trip_occurrence_case_events" ADD CONSTRAINT "trip_occurrence_case_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_occurrence_case_events" ADD CONSTRAINT "trip_occurrence_case_events_company_case_fk" FOREIGN KEY ("company_id","case_id") REFERENCES "trip_occurrence_cases"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_occurrence_cases" ADD CONSTRAINT "trip_occurrence_cases_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_occurrence_cases" ADD CONSTRAINT "trip_occurrence_cases_company_occurrence_fk" FOREIGN KEY ("company_id","occurrence_id") REFERENCES "trip_document_occurrences"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_redelivery_policy_check" CHECK ("redelivery_policy" in ('unset', 'allowed', 'blocked'));