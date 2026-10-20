-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 276 T4: tira a trava de pedido repetido do tipo de ocorrência. A escolha de cada tipo se perde (a
-- coluna é só configuração; nenhuma ocorrência guarda referência a ela).
BEGIN;

SET LOCAL lock_timeout = '3s';

ALTER TABLE "company_occurrence_types" DROP CONSTRAINT "company_occurrence_types_duplicate_request_policy_check";
ALTER TABLE "company_occurrence_types" DROP COLUMN "duplicate_request_policy";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261020193306_occurrence_duplicate_request_policy';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one occurrence_duplicate_request_policy journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
