-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz `arrival_reference_label`. Recusa (sem apagar nada) se algum perfil já tiver o texto: a
-- coluna antiga não o substitui — decida antes o que fazer com ele.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "contractor_receiving_profiles" WHERE "arrival_reference_label" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'contractor_receiving_profiles still has arrival_reference_label values';
  END IF;
END
$$;

ALTER TABLE "contractor_receiving_profiles"
  DROP CONSTRAINT IF EXISTS "contractor_receiving_profiles_arrival_reference_label_check";
ALTER TABLE "contractor_receiving_profiles" DROP COLUMN IF EXISTS "arrival_reference_label";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261004180153_contractor_receiving_arrival_reference_label';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one contractor_receiving_arrival_reference_label journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
