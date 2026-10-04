-- Copyright (c) 2026 Ada Technology. MIT License.
-- Spec 237 T4.2 (ADR-0094 §3/§4/§7): a prévia de carga por upload, os itens, o vínculo 1:1 com a nota,
-- o par roteiro ↔ carga, o alias aprendido, a trilha append-only e o pedido ao worker. Só tabelas
-- novas: nada em `nfe_documents`, `trip_documents` nem nas tabelas da chegada (a FK de
-- `cargo_previews.arrival_id` aponta para elas, sem alterá-las).
CREATE TABLE "cargo_previews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"contractor_id" uuid NOT NULL,
	"source" varchar(16) NOT NULL,
	"status" varchar(16) DEFAULT 'queued' NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"file_name" text NOT NULL,
	"file_sha256" char(64) NOT NULL,
	"file_object_id" uuid NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"sheet_name" text,
	"planned_date" date,
	"row_count" integer,
	"error_code" varchar(40),
	"uploaded_by_user_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_fingerprint" char(64) NOT NULL,
	"arrival_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cargo_previews_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "cargo_previews_company_contractor_file_unique" UNIQUE("company_id","contractor_id","file_sha256"),
	CONSTRAINT "cargo_previews_company_idempotency_key_unique" UNIQUE("company_id","idempotency_key"),
	CONSTRAINT "cargo_previews_source_check" CHECK ("source" in ('upload')),
	CONSTRAINT "cargo_previews_status_check" CHECK ("status" in ('failed', 'processing', 'queued', 'ready')),
	CONSTRAINT "cargo_previews_file_name_check" CHECK (char_length("file_name") between 1 and 180 and strpos("file_name", '/') = 0 and strpos("file_name", chr(92)) = 0),
	CONSTRAINT "cargo_previews_file_sha256_check" CHECK ("file_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "cargo_previews_file_size_bytes_check" CHECK ("file_size_bytes" > 0),
	CONSTRAINT "cargo_previews_sheet_name_check" CHECK (char_length("sheet_name") between 1 and 31),
	CONSTRAINT "cargo_previews_row_count_check" CHECK ("row_count" >= 0),
	CONSTRAINT "cargo_previews_error_code_check" CHECK ("error_code" in ('PREVIEW_CELL_TOO_LONG', 'PREVIEW_COLUMN_DUPLICATED', 'PREVIEW_COLUMN_NOT_FOUND', 'PREVIEW_FILE_CORRUPTED', 'PREVIEW_FILE_MISSING', 'PREVIEW_FILE_TOO_LARGE', 'PREVIEW_NOT_A_WORKBOOK', 'PREVIEW_NOT_ENABLED', 'PREVIEW_PARSE_TIMEOUT', 'PREVIEW_SHEET_NOT_FOUND', 'PREVIEW_TOO_MANY_ENTRIES', 'PREVIEW_TOO_MANY_ROWS', 'PREVIEW_TOO_MANY_STRINGS', 'PREVIEW_ZIP_BOMB', 'PREVIEW_ZIP_ENTRY_UNSAFE')),
	CONSTRAINT "cargo_previews_failure_shape_check" CHECK (("status" = 'failed') = ("error_code" is not null)),
	CONSTRAINT "cargo_previews_ready_shape_check" CHECK (("status" = 'ready') = ("row_count" is not null)),
	CONSTRAINT "cargo_previews_idempotency_key_check" CHECK (char_length("idempotency_key") between 16 and 256),
	CONSTRAINT "cargo_previews_request_fingerprint_check" CHECK ("request_fingerprint" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "cargo_preview_document_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"preview_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"linked_by" varchar(16) NOT NULL,
	"linked_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cargo_preview_document_links_company_document_unique" UNIQUE("company_id","document_id"),
	CONSTRAINT "cargo_preview_document_links_company_preview_document_unique" UNIQUE("company_id","preview_id","document_id"),
	CONSTRAINT "cargo_preview_document_links_linked_by_check" CHECK ("linked_by" in ('system', 'user')),
	CONSTRAINT "cargo_preview_document_links_actor_check" CHECK (("linked_by" = 'user') = ("linked_by_user_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "cargo_preview_route_loads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"preview_id" uuid NOT NULL,
	"route_name" text NOT NULL,
	"load_reference" text NOT NULL,
	"origin" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cargo_preview_route_loads_preview_route_unique" UNIQUE("company_id","preview_id","route_name"),
	CONSTRAINT "cargo_preview_route_loads_preview_load_unique" UNIQUE("company_id","preview_id","load_reference"),
	CONSTRAINT "cargo_preview_route_loads_route_name_check" CHECK (char_length("route_name") between 1 and 60),
	CONSTRAINT "cargo_preview_route_loads_load_reference_check" CHECK (char_length("load_reference") between 1 and 200),
	CONSTRAINT "cargo_preview_route_loads_origin_check" CHECK ("origin" in ('totals', 'user', 'votes'))
);
--> statement-breakpoint
CREATE TABLE "cargo_preview_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"preview_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"route_name" text,
	"routing_date" date,
	"contractor_reference" text,
	"recipient_code" text,
	"recipient_name" text,
	"weight_kg" numeric(12,3),
	"volume_m3" numeric(12,4),
	"value" numeric(14,2),
	"address" text,
	"neighborhood" text,
	"city" text,
	"state" text,
	"postal_code" text,
	"match_state" varchar(16) NOT NULL,
	"matched_document_id" uuid,
	"match_group_key" text,
	"match_evidence" jsonb,
	"matched_at" timestamp with time zone,
	"matched_by" varchar(16),
	"matched_by_user_id" uuid,
	"row_error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cargo_preview_items_company_preview_row_unique" UNIQUE("company_id","preview_id","row_number"),
	CONSTRAINT "cargo_preview_items_company_preview_id_unique" UNIQUE("company_id","preview_id","id"),
	CONSTRAINT "cargo_preview_items_row_number_check" CHECK ("row_number" > 0),
	CONSTRAINT "cargo_preview_items_match_state_check" CHECK ("match_state" in ('ambiguous', 'awaiting_xml', 'invalid', 'matched', 'suggested')),
	CONSTRAINT "cargo_preview_items_matched_by_check" CHECK ("matched_by" in ('system', 'user')),
	CONSTRAINT "cargo_preview_items_matched_shape_check" CHECK (("match_state" = 'matched') = ("matched_document_id" is not null)),
	CONSTRAINT "cargo_preview_items_invalid_shape_check" CHECK (("match_state" = 'invalid') = ("row_error" is not null)),
	CONSTRAINT "cargo_preview_items_valid_fields_check" CHECK ("match_state" = 'invalid' or ("route_name" is not null and "value" is not null and "weight_kg" is not null)),
	CONSTRAINT "cargo_preview_items_decision_shape_check" CHECK (("matched_by" is null) = ("matched_at" is null) and ("matched_by" = 'user') = ("matched_by_user_id" is not null)),
	CONSTRAINT "cargo_preview_items_weight_kg_check" CHECK ("weight_kg" >= 0),
	CONSTRAINT "cargo_preview_items_volume_m3_check" CHECK ("volume_m3" >= 0),
	CONSTRAINT "cargo_preview_items_value_check" CHECK ("value" >= 0),
	CONSTRAINT "cargo_preview_items_row_error_check" CHECK (jsonb_typeof("row_error") = 'array'),
	CONSTRAINT "cargo_preview_items_match_evidence_check" CHECK (jsonb_typeof("match_evidence") = 'object')
);
--> statement-breakpoint
CREATE TABLE "cargo_preview_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"preview_id" uuid NOT NULL,
	"item_id" uuid,
	"kind" varchar(32) NOT NULL,
	"actor_user_id" uuid,
	"channel" varchar(16) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"details" jsonb,
	CONSTRAINT "cargo_preview_events_kind_check" CHECK ("kind" in ('arrival_proposed', 'failed', 'item_ambiguous', 'item_confirmed', 'item_linked_manually', 'item_matched', 'item_suggested', 'item_unlinked', 'parsed', 'uploaded')),
	CONSTRAINT "cargo_preview_events_item_scope_check" CHECK (("kind" in ('uploaded', 'parsed', 'failed', 'arrival_proposed')) = ("item_id" is null)),
	CONSTRAINT "cargo_preview_events_channel_check" CHECK ("channel" in ('backoffice', 'worker')),
	CONSTRAINT "cargo_preview_events_actor_check" CHECK (("channel" = 'worker') = ("actor_user_id" is null)),
	CONSTRAINT "cargo_preview_events_details_check" CHECK (jsonb_typeof("details") = 'object')
);
--> statement-breakpoint
CREATE TABLE "cargo_preview_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"event_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"contractor_id" uuid NOT NULL,
	"preview_id" uuid,
	"event_type" varchar(40) NOT NULL,
	"event_version" bigint DEFAULT 1 NOT NULL,
	"correlation_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempt" bigint DEFAULT 0 NOT NULL,
	"claim_owner" text,
	"claim_expires_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cargo_preview_outbox_company_event_id_unique" UNIQUE("company_id","event_id"),
	CONSTRAINT "cargo_preview_outbox_event_type_check" CHECK ("event_type" in ('cargo-preview.process', 'cargo-preview.reevaluate')),
	CONSTRAINT "cargo_preview_outbox_preview_scope_check" CHECK (("event_type" = 'cargo-preview.process') = ("preview_id" is not null)),
	CONSTRAINT "cargo_preview_outbox_attempt_check" CHECK ("attempt" >= 0),
	CONSTRAINT "cargo_preview_outbox_event_version_check" CHECK ("event_version" > 0),
	CONSTRAINT "cargo_preview_outbox_claim_check" CHECK (("claim_owner" is null) = ("claim_expires_at" is null)),
	CONSTRAINT "cargo_preview_outbox_payload_check" CHECK (jsonb_typeof("payload") = 'object')
);
--> statement-breakpoint
CREATE TABLE "contractor_recipient_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"contractor_id" uuid NOT NULL,
	"recipient_code" text NOT NULL,
	"recipient_tax_id" text NOT NULL,
	"learned_from_preview_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contractor_recipient_aliases_contractor_code_unique" UNIQUE("company_id","contractor_id","recipient_code"),
	CONSTRAINT "contractor_recipient_aliases_recipient_code_check" CHECK (char_length("recipient_code") between 1 and 40),
	CONSTRAINT "contractor_recipient_aliases_recipient_tax_id_check" CHECK ("recipient_tax_id" ~ '^([0-9]{11}|[A-Z0-9]{12}[0-9]{2})$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "cargo_previews_company_arrival_unique" ON "cargo_previews" ("company_id","arrival_id") WHERE "arrival_id" is not null;--> statement-breakpoint
CREATE INDEX "cargo_previews_company_received_idx" ON "cargo_previews" ("company_id","received_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "cargo_previews_company_contractor_status_idx" ON "cargo_previews" ("company_id","contractor_id","status");--> statement-breakpoint
CREATE INDEX "cargo_preview_items_company_document_idx" ON "cargo_preview_items" ("company_id","matched_document_id") WHERE "matched_document_id" is not null;--> statement-breakpoint
CREATE INDEX "cargo_preview_items_company_preview_state_idx" ON "cargo_preview_items" ("company_id","preview_id","match_state");--> statement-breakpoint
CREATE INDEX "cargo_preview_events_company_preview_occurred_idx" ON "cargo_preview_events" ("company_id","preview_id","occurred_at");--> statement-breakpoint
CREATE INDEX "cargo_preview_outbox_due_idx" ON "cargo_preview_outbox" ("next_attempt_at","created_at") WHERE "published_at" is null;--> statement-breakpoint
CREATE INDEX "cargo_preview_outbox_pending_contractor_idx" ON "cargo_preview_outbox" ("company_id","contractor_id","event_type") WHERE "published_at" is null;--> statement-breakpoint
ALTER TABLE "cargo_previews" ADD CONSTRAINT "cargo_previews_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cargo_previews" ADD CONSTRAINT "cargo_previews_company_contractor_fk" FOREIGN KEY ("company_id","contractor_id") REFERENCES "contractors"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cargo_previews" ADD CONSTRAINT "cargo_previews_uploaded_by_membership_fk" FOREIGN KEY ("uploaded_by_user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cargo_previews" ADD CONSTRAINT "cargo_previews_company_arrival_fk" FOREIGN KEY ("company_id","arrival_id") REFERENCES "cargo_arrivals"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cargo_preview_document_links" ADD CONSTRAINT "cargo_preview_document_links_company_preview_fk" FOREIGN KEY ("company_id","preview_id") REFERENCES "cargo_previews"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cargo_preview_document_links" ADD CONSTRAINT "cargo_preview_document_links_company_document_fk" FOREIGN KEY ("company_id","document_id") REFERENCES "nfe_documents"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cargo_preview_document_links" ADD CONSTRAINT "cargo_preview_document_links_linked_by_membership_fk" FOREIGN KEY ("linked_by_user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cargo_preview_route_loads" ADD CONSTRAINT "cargo_preview_route_loads_company_preview_fk" FOREIGN KEY ("company_id","preview_id") REFERENCES "cargo_previews"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cargo_preview_items" ADD CONSTRAINT "cargo_preview_items_company_preview_fk" FOREIGN KEY ("company_id","preview_id") REFERENCES "cargo_previews"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cargo_preview_items" ADD CONSTRAINT "cargo_preview_items_document_link_fk" FOREIGN KEY ("company_id","preview_id","matched_document_id") REFERENCES "cargo_preview_document_links"("company_id","preview_id","document_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cargo_preview_items" ADD CONSTRAINT "cargo_preview_items_matched_by_membership_fk" FOREIGN KEY ("matched_by_user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cargo_preview_events" ADD CONSTRAINT "cargo_preview_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cargo_preview_events" ADD CONSTRAINT "cargo_preview_events_company_preview_fk" FOREIGN KEY ("company_id","preview_id") REFERENCES "cargo_previews"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cargo_preview_events" ADD CONSTRAINT "cargo_preview_events_item_fk" FOREIGN KEY ("company_id","preview_id","item_id") REFERENCES "cargo_preview_items"("company_id","preview_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cargo_preview_events" ADD CONSTRAINT "cargo_preview_events_actor_membership_fk" FOREIGN KEY ("actor_user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cargo_preview_outbox" ADD CONSTRAINT "cargo_preview_outbox_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cargo_preview_outbox" ADD CONSTRAINT "cargo_preview_outbox_company_contractor_fk" FOREIGN KEY ("company_id","contractor_id") REFERENCES "contractors"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cargo_preview_outbox" ADD CONSTRAINT "cargo_preview_outbox_company_preview_fk" FOREIGN KEY ("company_id","preview_id") REFERENCES "cargo_previews"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "contractor_recipient_aliases" ADD CONSTRAINT "contractor_recipient_aliases_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "contractor_recipient_aliases" ADD CONSTRAINT "contractor_recipient_aliases_company_contractor_fk" FOREIGN KEY ("company_id","contractor_id") REFERENCES "contractors"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "contractor_recipient_aliases" ADD CONSTRAINT "contractor_recipient_aliases_company_preview_fk" FOREIGN KEY ("company_id","learned_from_preview_id") REFERENCES "cargo_previews"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
CREATE FUNCTION "reject_cargo_preview_events_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'cargo_preview_events is append-only' USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "cargo_preview_events_append_only_trigger"
BEFORE UPDATE OR DELETE ON "cargo_preview_events"
FOR EACH ROW
EXECUTE FUNCTION "reject_cargo_preview_events_mutation"();
