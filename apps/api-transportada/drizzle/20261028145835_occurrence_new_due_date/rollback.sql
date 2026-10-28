-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Tira o ajuste "pedir a nova data de vencimento" do tipo e a data guardada na ocorrencia. Sem recusa: a data so aparece no
-- e-mail da contratante, que ja foi enviado; a coluna do tipo so liga o campo no app do motorista.
BEGIN;

SET LOCAL lock_timeout = '3s';

ALTER TABLE "company_occurrence_types" DROP COLUMN "asks_new_due_date";
ALTER TABLE "trip_document_occurrences" DROP COLUMN "requested_due_date";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261028145835_occurrence_new_due_date';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one occurrence_new_due_date journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
