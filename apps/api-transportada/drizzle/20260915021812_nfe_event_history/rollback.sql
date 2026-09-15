-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Remove o histórico fiscal da nota (spec 149 H1): as nove colunas de `nfe_events` e a trilha
-- `nfe_document_status_changes`.
--
-- ⚠️ Só desfaça antes de haver trilha gravada; depois disso, roll-forward (princípio 5). A trilha é
-- auditoria: apagar a tabela ou as colunas perde origem, ator e status anterior/novo de cada evento.
BEGIN;

DROP TABLE IF EXISTS "nfe_document_status_changes";

ALTER TABLE "nfe_events"
  DROP CONSTRAINT IF EXISTS "nfe_events_company_import_fk",
  DROP CONSTRAINT IF EXISTS "nfe_events_status_code_check",
  DROP CONSTRAINT IF EXISTS "nfe_events_protocol_check",
  DROP CONSTRAINT IF EXISTS "nfe_events_correction_text_check",
  DROP CONSTRAINT IF EXISTS "nfe_events_origin_check",
  DROP CONSTRAINT IF EXISTS "nfe_events_origin_actor_check",
  DROP CONSTRAINT IF EXISTS "nfe_events_origin_import_check",
  DROP CONSTRAINT IF EXISTS "nfe_events_document_status_check",
  DROP CONSTRAINT IF EXISTS "nfe_events_document_status_pair_check",
  DROP CONSTRAINT IF EXISTS "nfe_events_document_status_transition_check",
  DROP COLUMN IF EXISTS "status_code",
  DROP COLUMN IF EXISTS "protocol",
  DROP COLUMN IF EXISTS "correction_text",
  DROP COLUMN IF EXISTS "import_id",
  DROP COLUMN IF EXISTS "origin",
  DROP COLUMN IF EXISTS "actor_user_id",
  DROP COLUMN IF EXISTS "requested_by_user_id",
  DROP COLUMN IF EXISTS "document_status_before",
  DROP COLUMN IF EXISTS "document_status_after";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260915021812_nfe_event_history';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one nfe_event_history journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
