-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz a spec 185 T2.2 (RF6, ADR-0074 §4): a coluna `leaves_document_behind` de
-- `company_occurrence_types`, com o CHECK do seu vocabulário.
--
-- O que se perde: a marca "a viagem segue sem a nota" de todo tipo cadastrado. A coluna é aditiva
-- e nasce com padrão (`false`) — nenhuma outra tabela depende dela.

BEGIN;

ALTER TABLE "company_occurrence_types" DROP CONSTRAINT "company_occurrence_types_leaves_document_behind_check";

ALTER TABLE "company_occurrence_types" DROP COLUMN "leaves_document_behind";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260924201710_occurrence_type_leaves_document_behind';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one occurrence_type_leaves_document_behind migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
