-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz a spec 167 (RF1/RF6): a tabela `trip_document_occurrence_corrections` e as três colunas de
-- cancelamento de `trip_document_occurrences`.
--
-- O que se perde: todo histórico de correção gravado e todo cancelamento registrado. As colunas são
-- aditivas e anuláveis — nenhuma outra tabela depende delas.

BEGIN;

ALTER TABLE "trip_document_occurrences" DROP CONSTRAINT "trip_document_occurrences_cancellation_presence_check";

ALTER TABLE "trip_document_occurrences" DROP CONSTRAINT "trip_document_occurrences_company_cancelled_by_fk";

ALTER TABLE "trip_document_occurrences" DROP COLUMN "cancellation_reason";

ALTER TABLE "trip_document_occurrences" DROP COLUMN "cancelled_by_user_id";

ALTER TABLE "trip_document_occurrences" DROP COLUMN "cancelled_at";

DROP TABLE "trip_document_occurrence_corrections";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260928010022_occurrence_correction_and_cancellation'
      AND "hash" = 'fc4289c40c812f823a9472809096e7c554db560b2d842a83094abebba60b81a5';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one occurrence_correction_and_cancellation migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
