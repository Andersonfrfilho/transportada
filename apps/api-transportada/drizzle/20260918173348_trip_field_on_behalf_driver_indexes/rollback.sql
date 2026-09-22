-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 156 T15: os índices parciais das chaves estrangeiras
-- (company_id, on_behalf_of_driver_id) das sete tabelas de campo. Só DDL de índice — nenhum dado
-- depende deles.
BEGIN;

DROP INDEX IF EXISTS "trip_delivery_proofs_company_on_behalf_driver_idx";
DROP INDEX IF EXISTS "trip_document_events_company_on_behalf_driver_idx";
DROP INDEX IF EXISTS "trip_document_occurrences_company_on_behalf_driver_idx";
DROP INDEX IF EXISTS "trip_field_reports_company_on_behalf_driver_idx";
DROP INDEX IF EXISTS "trip_status_events_company_on_behalf_driver_idx";
DROP INDEX IF EXISTS "trip_stop_events_company_on_behalf_driver_idx";
DROP INDEX IF EXISTS "trip_stop_occurrences_company_on_behalf_driver_idx";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260918173348_trip_field_on_behalf_driver_indexes';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_field_on_behalf_driver_indexes journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
