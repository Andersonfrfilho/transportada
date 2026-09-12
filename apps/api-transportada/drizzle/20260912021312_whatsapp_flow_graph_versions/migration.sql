-- Copyright (c) 2026 Ada Technology. MIT License.
-- Spec 144 T008 — conversation-flow.md §1 exige que a versão anterior da conversa publicada fique
-- no histórico, e a FlowGraphRepository do @adatechnology/meta-whatsapp-module@0.1.0 sobrescreve a
-- linha viva (create/save não guardam versão nenhuma). Esta tabela é o histórico que falta, no
-- mesmo padrão append-only de audit_logs e trip_dispatch_snapshots (20260824204913).
CREATE TABLE "whatsapp_flow_graph_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"flow_key" text NOT NULL,
	"version" integer NOT NULL,
	"nodes" jsonb NOT NULL,
	"start_node_id" text NOT NULL,
	"label" text NOT NULL,
	"published_by" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_flow_graph_versions_company_flow_version_unique" UNIQUE("company_id","flow_key","version"),
	CONSTRAINT "whatsapp_flow_graph_versions_flow_key_check" CHECK (length("flow_key") > 0),
	CONSTRAINT "whatsapp_flow_graph_versions_version_check" CHECK ("version" >= 1),
	CONSTRAINT "whatsapp_flow_graph_versions_start_node_id_check" CHECK (length("start_node_id") > 0),
	CONSTRAINT "whatsapp_flow_graph_versions_published_by_check" CHECK (length("published_by") > 0),
	CONSTRAINT "whatsapp_flow_graph_versions_source_check" CHECK ("source" in ('code', 'panel'))
);
--> statement-breakpoint
ALTER TABLE "whatsapp_flow_graph_versions" ADD CONSTRAINT "whatsapp_flow_graph_versions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
CREATE FUNCTION "reject_whatsapp_flow_graph_versions_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'whatsapp_flow_graph_versions is append-only' USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "whatsapp_flow_graph_versions_append_only_trigger"
BEFORE UPDATE OR DELETE ON "whatsapp_flow_graph_versions"
FOR EACH ROW
EXECUTE FUNCTION "reject_whatsapp_flow_graph_versions_mutation"();
