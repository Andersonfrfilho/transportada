-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Spec 266 / ADR-0105: andamento da ocorrência (resolvida/reaberta), só inserção. Aditiva: tabela nova, nenhuma
-- tabela existente muda.
CREATE TABLE "trip_occurrence_resolution_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"document_occurrence_id" uuid,
	"stop_occurrence_id" uuid,
	"kind" varchar NOT NULL,
	"actor_kind" varchar NOT NULL,
	"actor_user_id" uuid,
	"case_event_id" uuid,
	"note" text,
	"conversation_message_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_occurrence_resolution_events_kind_check" CHECK ("kind" in ('resolved', 'reopened')),
	CONSTRAINT "trip_occurrence_resolution_events_actor_kind_check" CHECK ("actor_kind" in ('internal', 'driver', 'system')),
	CONSTRAINT "trip_occurrence_resolution_events_owner_check" CHECK (num_nonnulls("document_occurrence_id", "stop_occurrence_id") = 1),
	CONSTRAINT "trip_occurrence_resolution_events_system_actor_check" CHECK (("actor_kind" = 'system') = ("actor_user_id" is null)),
	CONSTRAINT "trip_occurrence_resolution_events_system_case_event_check" CHECK (("actor_kind" = 'system') = ("case_event_id" is not null)),
	CONSTRAINT "trip_occurrence_resolution_events_internal_note_check" CHECK ("kind" <> 'resolved' or "actor_kind" <> 'internal' or length(btrim("note")) > 0),
	CONSTRAINT "trip_occurrence_resolution_events_reopen_check" CHECK ("kind" <> 'reopened' or ("actor_kind" = 'driver' and "conversation_message_id" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "trip_occurrence_resolution_events_case_event_unique" ON "trip_occurrence_resolution_events" ("company_id","case_event_id") WHERE "case_event_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "trip_occurrence_resolution_events_message_unique" ON "trip_occurrence_resolution_events" ("company_id","conversation_message_id") WHERE "conversation_message_id" is not null;--> statement-breakpoint
CREATE INDEX "trip_occurrence_resolution_events_document_latest_idx" ON "trip_occurrence_resolution_events" ("company_id","document_occurrence_id","created_at" DESC NULLS LAST,"id") WHERE "document_occurrence_id" is not null;--> statement-breakpoint
CREATE INDEX "trip_occurrence_resolution_events_stop_latest_idx" ON "trip_occurrence_resolution_events" ("company_id","stop_occurrence_id","created_at" DESC NULLS LAST,"id") WHERE "stop_occurrence_id" is not null;--> statement-breakpoint
ALTER TABLE "trip_occurrence_resolution_events" ADD CONSTRAINT "trip_occurrence_resolution_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_occurrence_resolution_events" ADD CONSTRAINT "trip_occurrence_resolution_events_company_document_occurrence_fk" FOREIGN KEY ("company_id","document_occurrence_id") REFERENCES "trip_document_occurrences"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_occurrence_resolution_events" ADD CONSTRAINT "trip_occurrence_resolution_events_company_stop_occurrence_fk" FOREIGN KEY ("company_id","stop_occurrence_id") REFERENCES "trip_stop_occurrences"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_occurrence_resolution_events" ADD CONSTRAINT "trip_occurrence_resolution_events_company_case_event_fk" FOREIGN KEY ("company_id","case_event_id") REFERENCES "trip_occurrence_case_events"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_occurrence_resolution_events" ADD CONSTRAINT "trip_occurrence_resolution_events_company_message_fk" FOREIGN KEY ("company_id","conversation_message_id") REFERENCES "occurrence_conversation_messages"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;