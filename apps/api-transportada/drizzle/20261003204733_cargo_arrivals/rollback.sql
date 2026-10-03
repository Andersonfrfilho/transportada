-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 237 T2.2 (ADR-0094 §6): apaga as chegadas, as notas delas, a trilha e o índice dos
-- emitentes. ⚠️ A trilha de quem recebeu e separou cada nota se perde com as tabelas: confira antes
-- (select count(*) from cargo_arrival_events) e guarde o que precisar.
BEGIN;

DROP TRIGGER IF EXISTS "cargo_arrival_events_append_only_trigger" ON "cargo_arrival_events";
DROP FUNCTION IF EXISTS "reject_cargo_arrival_events_mutation"();
DROP TABLE IF EXISTS "cargo_arrival_events";
DROP TABLE IF EXISTS "cargo_arrival_documents";
DROP TABLE IF EXISTS "cargo_arrivals";
SET LOCAL lock_timeout = '3s';
DROP INDEX IF EXISTS "nfe_participants_company_role_tax_id_idx";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261003204733_cargo_arrivals';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one cargo_arrivals journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
