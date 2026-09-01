-- Copyright (c) 2026 Ada Technology. MIT License.
-- ADR-0043 §2: o roteiro que o motorista levou congela no despacho. Tabela própria, e não coluna
-- em `trips`, porque `trips` sofre UPDATE a cada transição de estado e nunca poderia carregar o
-- trigger append-only — o mesmo padrão que já protege `audit_logs` e `fiscal_sequence_reservations`
-- (20260720003709_company_fiscal_settings).
-- O trigger de `trip_document_events` entra junto: a T004 criou a tabela append-only por convenção
-- de código, e esta migration transforma isso em constraint. A trilha de quem separou o quê tem o
-- mesmo peso de auditoria que `audit_logs`, e merece a mesma proteção.
CREATE TABLE "trip_dispatch_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"snapshot_sha256" text NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"forced" boolean DEFAULT false NOT NULL,
	"force_reason" text,
	"dispatched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_dispatch_snapshots_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "trip_dispatch_snapshots_company_trip_unique" UNIQUE("company_id","trip_id"),
	CONSTRAINT "trip_dispatch_snapshots_sha256_check" CHECK ("snapshot_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "trip_dispatch_snapshots_force_reason_check" CHECK ("forced" = ("force_reason" is not null)),
	CONSTRAINT "trip_dispatch_snapshots_stops_shape_check" CHECK (jsonb_typeof("snapshot" -> 'stops') = 'array')
);
--> statement-breakpoint
ALTER TABLE "trip_dispatch_snapshots" ADD CONSTRAINT "trip_dispatch_snapshots_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_dispatch_snapshots" ADD CONSTRAINT "trip_dispatch_snapshots_company_trip_fk" FOREIGN KEY ("company_id","trip_id") REFERENCES "trips"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_dispatch_snapshots" ADD CONSTRAINT "trip_dispatch_snapshots_actor_membership_fk" FOREIGN KEY ("actor_user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
CREATE FUNCTION "reject_trip_dispatch_snapshots_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'trip_dispatch_snapshots is append-only' USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "trip_dispatch_snapshots_append_only_trigger"
BEFORE UPDATE OR DELETE ON "trip_dispatch_snapshots"
FOR EACH ROW
EXECUTE FUNCTION "reject_trip_dispatch_snapshots_mutation"();--> statement-breakpoint
CREATE FUNCTION "reject_trip_document_events_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'trip_document_events is append-only' USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "trip_document_events_append_only_trigger"
BEFORE UPDATE OR DELETE ON "trip_document_events"
FOR EACH ROW
EXECUTE FUNCTION "reject_trip_document_events_mutation"();
