CREATE TABLE "delivery_charge_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"charge_id" uuid NOT NULL,
	"event_name" text NOT NULL,
	"actor_user_id" uuid,
	"decided_by_token" text,
	"payload" jsonb DEFAULT '{}' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_charge_events_name_check" CHECK ("event_name" in ('suggested', 'recorded', 'dismissed', 'submitted', 'approved', 'rejected', 'reimbursed'))
);
--> statement-breakpoint
CREATE TABLE "delivery_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"delivery_client_id" uuid NOT NULL,
	"contractor_id" uuid,
	"trip_id" uuid,
	"trip_document_id" uuid,
	"batch_id" uuid,
	"charge_type" text NOT NULL,
	"amount" numeric(14,4) NOT NULL,
	"charged_on" date NOT NULL,
	"status" text NOT NULL,
	"origin" text NOT NULL,
	"proof_object_id" uuid,
	"notes" text DEFAULT '' NOT NULL,
	"rejection_reason" text DEFAULT '' NOT NULL,
	"recorded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_charges_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "delivery_charges_type_check" CHECK ("charge_type" in ('unloading', 'scheduling', 'platform', 'parking', 'other')),
	CONSTRAINT "delivery_charges_status_check" CHECK ("status" in ('suggested', 'recorded', 'submitted', 'approved', 'rejected', 'reimbursed')),
	CONSTRAINT "delivery_charges_origin_check" CHECK ("origin" in ('manual', 'recurring', 'occurrence')),
	CONSTRAINT "delivery_charges_amount_check" CHECK ("amount" > 0),
	CONSTRAINT "delivery_charges_suggested_origin_check" CHECK ("status" <> 'suggested' or "origin" <> 'manual'),
	CONSTRAINT "delivery_charges_batch_status_check" CHECK ("batch_id" is null or "status" in ('submitted', 'approved', 'rejected', 'reimbursed'))
);
--> statement-breakpoint
CREATE TABLE "delivery_client_charge_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"delivery_client_id" uuid NOT NULL,
	"charge_type" text NOT NULL,
	"expected_amount" numeric(14,4) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"activated_by_user_id" uuid,
	"deactivated_by_user_id" uuid,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_client_charge_rules_type_check" CHECK ("charge_type" in ('unloading', 'scheduling', 'platform', 'parking', 'other')),
	CONSTRAINT "delivery_client_charge_rules_amount_check" CHECK ("expected_amount" > 0),
	CONSTRAINT "delivery_client_charge_rules_deactivation_check" CHECK ("active" or ("deactivated_at" is not null and "deactivated_by_user_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "extra_charge_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"contractor_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" text DEFAULT 'closed' NOT NULL,
	"access_token" text NOT NULL CONSTRAINT "extra_charge_batches_access_token_unique" UNIQUE,
	"token_rotated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"total_amount" numeric(14,4) DEFAULT '0' NOT NULL,
	"closed_by_user_id" uuid NOT NULL,
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "extra_charge_batches_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "extra_charge_batches_status_check" CHECK ("status" in ('closed', 'submitted', 'decided')),
	CONSTRAINT "extra_charge_batches_period_check" CHECK ("period_start" <= "period_end"),
	CONSTRAINT "extra_charge_batches_total_check" CHECK ("total_amount" >= 0),
	CONSTRAINT "extra_charge_batches_token_check" CHECK (length("access_token") >= 32)
);
--> statement-breakpoint
CREATE TABLE "trip_stop_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"stop_id" uuid NOT NULL,
	"delivery_client_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"protocol" text DEFAULT '' NOT NULL,
	"diverged_at" timestamp with time zone,
	"notes" text DEFAULT '' NOT NULL,
	"requested_by_user_id" uuid,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_stop_schedules_company_stop_unique" UNIQUE("company_id","stop_id"),
	CONSTRAINT "trip_stop_schedules_status_check" CHECK ("status" in ('pending', 'requested', 'confirmed', 'refused')),
	CONSTRAINT "trip_stop_schedules_confirmed_check" CHECK ("status" <> 'confirmed' or "scheduled_at" is not null)
);
--> statement-breakpoint
CREATE INDEX "delivery_charge_events_charge_idx" ON "delivery_charge_events" ("company_id","charge_id");--> statement-breakpoint
CREATE INDEX "delivery_charges_status_idx" ON "delivery_charges" ("company_id","status");--> statement-breakpoint
CREATE INDEX "delivery_charges_batch_idx" ON "delivery_charges" ("company_id","batch_id");--> statement-breakpoint
CREATE INDEX "delivery_charges_client_idx" ON "delivery_charges" ("company_id","delivery_client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_client_charge_rules_active_unique" ON "delivery_client_charge_rules" ("company_id","delivery_client_id","charge_type") WHERE "active";--> statement-breakpoint
CREATE INDEX "extra_charge_batches_contractor_idx" ON "extra_charge_batches" ("company_id","contractor_id");--> statement-breakpoint
CREATE INDEX "trip_stop_schedules_trip_idx" ON "trip_stop_schedules" ("company_id","trip_id");--> statement-breakpoint
ALTER TABLE "delivery_charge_events" ADD CONSTRAINT "delivery_charge_events_charge_fk" FOREIGN KEY ("company_id","charge_id") REFERENCES "delivery_charges"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "delivery_charges" ADD CONSTRAINT "delivery_charges_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "delivery_charges" ADD CONSTRAINT "delivery_charges_company_client_fk" FOREIGN KEY ("company_id","delivery_client_id") REFERENCES "delivery_clients"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "delivery_charges" ADD CONSTRAINT "delivery_charges_company_contractor_fk" FOREIGN KEY ("company_id","contractor_id") REFERENCES "contractors"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "delivery_client_charge_rules" ADD CONSTRAINT "delivery_client_charge_rules_client_fk" FOREIGN KEY ("company_id","delivery_client_id") REFERENCES "delivery_clients"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "extra_charge_batches" ADD CONSTRAINT "extra_charge_batches_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "extra_charge_batches" ADD CONSTRAINT "extra_charge_batches_company_contractor_fk" FOREIGN KEY ("company_id","contractor_id") REFERENCES "contractors"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_stop_schedules" ADD CONSTRAINT "trip_stop_schedules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;