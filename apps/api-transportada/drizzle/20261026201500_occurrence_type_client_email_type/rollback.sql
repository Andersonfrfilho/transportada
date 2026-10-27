-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 279 T3b: tira o tipo de e-mail do cliente do tipo de ocorrencia. A escolha de cada tipo se perde (a coluna e so
-- configuracao; nenhuma ocorrencia guarda referencia a ela).
BEGIN;

SET LOCAL lock_timeout = '3s';

ALTER TABLE "company_occurrence_types" DROP CONSTRAINT "company_occurrence_types_client_email_type_check";
ALTER TABLE "company_occurrence_types" DROP COLUMN "client_email_type";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261026201500_occurrence_type_client_email_type';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one occurrence_type_client_email_type journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
