-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Tira a trava de motorista do tipo de ocorrência. A escolha de cada tipo se perde (a coluna é só configuração;
-- nenhuma ocorrência guarda referência a ela).
BEGIN;

SET LOCAL lock_timeout = '3s';

ALTER TABLE "company_occurrence_types" DROP CONSTRAINT "company_occurrence_types_driver_lock_minutes_check";
ALTER TABLE "company_occurrence_types" DROP COLUMN "driver_lock_minutes";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261029172646_occurrence_driver_lock';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one occurrence_driver_lock journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
