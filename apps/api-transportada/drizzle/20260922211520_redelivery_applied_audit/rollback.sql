-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz a spec 164 T14b: `redelivery_applied_at`/`redelivery_applied_by_user_id` em
-- `trip_occurrence_cases` (quem aplicou a proposta de reentrega e quando) e os três CHECKs que os
-- amarram entre si e a `decision_kind = 'redelivery_authorized'`.
--
-- Aditiva: nenhuma linha existente muda de valor. Recusa (RAISE) só se alguma linha já tiver
-- `redelivery_applied_at` preenchido — apagar a coluna apagaria auditoria de verdade.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "trip_occurrence_cases" WHERE "redelivery_applied_at" IS NOT NULL) THEN
    RAISE EXCEPTION 'trip_occurrence_cases has redelivery_applied_at rows, refusing rollback';
  END IF;
END
$$;

ALTER TABLE "trip_occurrence_cases" DROP CONSTRAINT "trip_occurrence_cases_redelivery_applied_check";
ALTER TABLE "trip_occurrence_cases" DROP CONSTRAINT "trip_occurrence_cases_redelivery_applied_by_check";
ALTER TABLE "trip_occurrence_cases" DROP CONSTRAINT "trip_occurrence_cases_redelivery_application_decision_check";
ALTER TABLE "trip_occurrence_cases" DROP COLUMN "redelivery_applied_by_user_id";
ALTER TABLE "trip_occurrence_cases" DROP COLUMN "redelivery_applied_at";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260922211520_redelivery_applied_audit'
      AND "hash" = '084e4fffaca5fab6460724b3d1cb6deb3e421321ba4f8203d7b4f869e2e56ce0';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one redelivery_applied_audit migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
