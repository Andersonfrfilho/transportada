-- Copyright (c) 2026 Ada Technology. MIT License.
-- Spec 237 T2.2 (ADR-0094 §6): a chegada da carga e a primeira separação, antes da viagem. Só tabelas
-- novas e um índice novo em `nfe_participants` (as notas de um emitente); nada em `trip_documents`.
-- `cargo_arrival_events` é append-only por trigger, no molde de `trip_document_events`
-- (20260824204913_trip_dispatch_snapshots).
CREATE TABLE "cargo_arrival_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"arrival_id" uuid NOT NULL,
	"nfe_document_id" uuid NOT NULL,
	"route_name" text,
	"city_ibge_code" text,
	"separation_state" varchar(16) DEFAULT 'expected' NOT NULL,
	"received_at" timestamp with time zone,
	"separated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cargo_arrival_documents_company_arrival_id_unique" UNIQUE("company_id","arrival_id","id"),
	CONSTRAINT "cargo_arrival_documents_company_document_unique" UNIQUE("company_id","nfe_document_id"),
	CONSTRAINT "cargo_arrival_documents_route_name_check" CHECK (char_length("route_name") between 1 and 40),
	CONSTRAINT "cargo_arrival_documents_city_ibge_code_check" CHECK ("city_ibge_code" ~ '^[0-9]{7}$'),
	CONSTRAINT "cargo_arrival_documents_separation_state_check" CHECK ("separation_state" in ('expected', 'received', 'separated')),
	CONSTRAINT "cargo_arrival_documents_state_dates_check" CHECK (("separation_state" = 'expected' and "received_at" is null and "separated_at" is null) or ("separation_state" = 'received' and "received_at" is not null and "separated_at" is null) or ("separation_state" = 'separated' and "received_at" is not null and "separated_at" >= "received_at"))
);
--> statement-breakpoint
CREATE TABLE "cargo_arrivals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"contractor_id" uuid NOT NULL,
	"arrived_at" timestamp with time zone NOT NULL,
	"pallet_count" integer,
	"separation_window_hours" smallint,
	"delivery_deadline_business_days" smallint,
	"separation_due_at" timestamp with time zone,
	"reference" text,
	"registered_by_user_id" uuid NOT NULL,
	"channel" varchar(16) NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"status" varchar(16) DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cargo_arrivals_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "cargo_arrivals_company_idempotency_key_unique" UNIQUE("company_id","idempotency_key"),
	CONSTRAINT "cargo_arrivals_pallet_count_check" CHECK ("pallet_count" >= 0),
	CONSTRAINT "cargo_arrivals_separation_window_hours_check" CHECK ("separation_window_hours" between 1 and 168),
	CONSTRAINT "cargo_arrivals_delivery_deadline_business_days_check" CHECK ("delivery_deadline_business_days" between 1 and 60),
	CONSTRAINT "cargo_arrivals_separation_due_at_check" CHECK (("separation_window_hours" is null and "separation_due_at" is null) or extract(epoch from "separation_due_at" - "arrived_at") = "separation_window_hours" * 3600),
	CONSTRAINT "cargo_arrivals_reference_check" CHECK (char_length("reference") between 1 and 120),
	CONSTRAINT "cargo_arrivals_channel_check" CHECK ("channel" in ('backoffice')),
	CONSTRAINT "cargo_arrivals_idempotency_key_check" CHECK (char_length("idempotency_key") between 16 and 256),
	CONSTRAINT "cargo_arrivals_request_fingerprint_check" CHECK ("request_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "cargo_arrivals_status_check" CHECK ("status" in ('open', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "cargo_arrival_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"arrival_id" uuid NOT NULL,
	"arrival_document_id" uuid,
	"kind" varchar(32) NOT NULL,
	"from_state" varchar(16),
	"to_state" varchar(16),
	"actor_user_id" uuid NOT NULL,
	"channel" varchar(16) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"details" jsonb,
	CONSTRAINT "cargo_arrival_events_kind_check" CHECK ("kind" in ('arrival_closed', 'arrival_registered', 'document_added', 'document_received', 'document_separated', 'route_assigned')),
	CONSTRAINT "cargo_arrival_events_document_scope_check" CHECK (("kind" in ('arrival_registered', 'arrival_closed')) = ("arrival_document_id" is null)),
	CONSTRAINT "cargo_arrival_events_state_shape_check" CHECK (case "kind" when 'document_added' then "from_state" is null and "to_state" = 'expected' when 'document_received' then "from_state" = 'expected' and "to_state" = 'received' when 'document_separated' then "from_state" = 'received' and "to_state" = 'separated' else "from_state" is null and "to_state" is null end),
	CONSTRAINT "cargo_arrival_events_channel_check" CHECK ("channel" in ('backoffice')),
	CONSTRAINT "cargo_arrival_events_details_check" CHECK (jsonb_typeof("details") = 'object')
);
--> statement-breakpoint
-- O índice novo trava a escrita em `nfe_participants` (a importação de NF-e) enquanto é construído:
-- espera curta, e uma transação longa à frente reprova o deploy em vez de enfileirar a importação.
SET LOCAL lock_timeout = '3s';--> statement-breakpoint
CREATE INDEX "nfe_participants_company_role_tax_id_idx" ON "nfe_participants" ("company_id","role","tax_id");--> statement-breakpoint
SET LOCAL lock_timeout = DEFAULT;--> statement-breakpoint
CREATE INDEX "cargo_arrivals_company_arrived_idx" ON "cargo_arrivals" ("company_id","arrived_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "cargo_arrivals_company_contractor_arrived_idx" ON "cargo_arrivals" ("company_id","contractor_id","arrived_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "cargo_arrival_events_company_arrival_occurred_idx" ON "cargo_arrival_events" ("company_id","arrival_id","occurred_at");--> statement-breakpoint
CREATE INDEX "cargo_arrival_events_company_arrival_document_idx" ON "cargo_arrival_events" ("company_id","arrival_id","arrival_document_id") WHERE "arrival_document_id" is not null;--> statement-breakpoint
ALTER TABLE "cargo_arrival_documents" ADD CONSTRAINT "cargo_arrival_documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cargo_arrival_documents" ADD CONSTRAINT "cargo_arrival_documents_company_arrival_fk" FOREIGN KEY ("company_id","arrival_id") REFERENCES "cargo_arrivals"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cargo_arrival_documents" ADD CONSTRAINT "cargo_arrival_documents_company_document_fk" FOREIGN KEY ("company_id","nfe_document_id") REFERENCES "nfe_documents"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cargo_arrivals" ADD CONSTRAINT "cargo_arrivals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cargo_arrivals" ADD CONSTRAINT "cargo_arrivals_company_contractor_fk" FOREIGN KEY ("company_id","contractor_id") REFERENCES "contractors"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cargo_arrivals" ADD CONSTRAINT "cargo_arrivals_registered_by_membership_fk" FOREIGN KEY ("registered_by_user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cargo_arrival_events" ADD CONSTRAINT "cargo_arrival_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cargo_arrival_events" ADD CONSTRAINT "cargo_arrival_events_company_arrival_fk" FOREIGN KEY ("company_id","arrival_id") REFERENCES "cargo_arrivals"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cargo_arrival_events" ADD CONSTRAINT "cargo_arrival_events_arrival_document_fk" FOREIGN KEY ("company_id","arrival_id","arrival_document_id") REFERENCES "cargo_arrival_documents"("company_id","arrival_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cargo_arrival_events" ADD CONSTRAINT "cargo_arrival_events_actor_membership_fk" FOREIGN KEY ("actor_user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
CREATE FUNCTION "reject_cargo_arrival_events_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'cargo_arrival_events is append-only' USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "cargo_arrival_events_append_only_trigger"
BEFORE UPDATE OR DELETE ON "cargo_arrival_events"
FOR EACH ROW
EXECUTE FUNCTION "reject_cargo_arrival_events_mutation"();
