-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Remove whatsapp_flow_graph_versions e o histórico com ela. Recusa rodar se qualquer versão já
-- foi registrada: apagar o histórico da conversa publicada é o mesmo defeito que esta migration
-- veio corrigir (conversation-flow.md §1). Para prosseguir, decida o que fazer com a história antes:
-- select flow_key, version, source, published_by, created_at from whatsapp_flow_graph_versions
--   order by flow_key, version;
BEGIN;

DO $$
DECLARE
  recorded_versions integer;
BEGIN
  SELECT count(*) INTO recorded_versions FROM "whatsapp_flow_graph_versions";

  IF recorded_versions > 0 THEN
    RAISE EXCEPTION 'Refusing to roll back: % whatsapp flow graph version(s) would lose their history',
      recorded_versions;
  END IF;
END
$$;

DROP TRIGGER "whatsapp_flow_graph_versions_append_only_trigger" ON "whatsapp_flow_graph_versions";
DROP FUNCTION "reject_whatsapp_flow_graph_versions_mutation"();

DROP TABLE "whatsapp_flow_graph_versions";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260912021312_whatsapp_flow_graph_versions'
      AND "hash" = '8dad49afa34694c1489fef9b0eafd1909ab28162bdabb4cbc80b2766f50d57aa';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one whatsapp_flow_graph_versions migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
