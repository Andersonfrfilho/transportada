-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverte a T022 da spec 066: a tabela de anexo de candidatura.
--
-- E **quebra** se existir anexo ja vinculado a uma candidatura: apagar a tabela em silencio
-- descartaria o documento que o operador usou para decidir, e a decisao dele continuaria de pe
-- sem a prova que a sustentou. Anexo ainda sem candidatura e rascunho, e some sem perda.
BEGIN;

DO $$
DECLARE
  affected integer;
BEGIN
  SELECT count(*) INTO affected
    FROM "aggregate_application_attachments"
    WHERE "application_id" IS NOT NULL;
  IF affected > 0 THEN
    RAISE EXCEPTION 'Attachments already linked to applications: %. Detach or archive them before rolling back.', affected;
  END IF;
END
$$;

DROP TABLE IF EXISTS "aggregate_application_attachments";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260827200542_aggregate_application_attachments'
      AND "hash" = '561a72d73aca0bab49b29b1699fb9b5b84b9ff93ce4ff460695296282f97968a';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one aggregate_application_attachments migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
