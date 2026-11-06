-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 298 T1.1: remove as tabelas de busca por chave e de orçamento, e volta as CHECKs de origem e de evento.
--
-- ⚠️ Só com aprovação humana, e só antes de haver busca ou documento vindo por chave. As linhas com
-- `source = 'access_key'` são reclassificadas para `'upload'` para a CHECK antiga caber; isso apaga a
-- origem real da importação. Depois de uma busca em produção, roll-forward (princípio 5).
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  pending_outbox_events integer;
BEGIN
  SELECT count(*) INTO pending_outbox_events
    FROM "processing_outbox"
    WHERE "event_type" = 'transportada.nfe.access-key.requested';

  IF pending_outbox_events > 0 THEN
    RAISE EXCEPTION 'Refusing rollback: % processing_outbox rows with transportada.nfe.access-key.requested', pending_outbox_events;
  END IF;
END
$$;

DROP TABLE IF EXISTS "nfe_access_key_lookups";
DROP TABLE IF EXISTS "nfe_access_key_lookup_budgets";

UPDATE "nfe_documents" SET "source" = 'upload' WHERE "source" = 'access_key';
UPDATE "nfe_imports" SET "source" = 'upload' WHERE "source" = 'access_key';

ALTER TABLE "nfe_documents" DROP CONSTRAINT "nfe_documents_source_check",
  ADD CONSTRAINT "nfe_documents_source_check" CHECK ("source" in ('upload', 'distribution'));

ALTER TABLE "nfe_imports" DROP CONSTRAINT "nfe_imports_source_check",
  ADD CONSTRAINT "nfe_imports_source_check" CHECK ("source" in ('upload', 'distribution'));

ALTER TABLE "processing_outbox" DROP CONSTRAINT "processing_outbox_event_type_check",
  ADD CONSTRAINT "processing_outbox_event_type_check" CHECK ("event_type" in ('transportada.nfe.import.requested', 'transportada.nfe.distribution.requested'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261106120034_nfe_access_key_lookups';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one nfe_access_key_lookups journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
