-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 156 T8c: as três colunas de encerramento pelo escritório (`closed_at`,
-- `closed_by_user_id`, `close_reason`), a FK composta com `user_company_memberships` e o CHECK que
-- as mantém coerentes. Aditiva, sem backfill — reverter não perde nenhum dado de negócio fora das
-- próprias três colunas.
BEGIN;

ALTER TABLE "trips" DROP CONSTRAINT IF EXISTS "trips_close_check";
ALTER TABLE "trips" DROP CONSTRAINT IF EXISTS "trips_company_closed_by_user_fk";
ALTER TABLE "trips" DROP COLUMN IF EXISTS "close_reason";
ALTER TABLE "trips" DROP COLUMN IF EXISTS "closed_by_user_id";
ALTER TABLE "trips" DROP COLUMN IF EXISTS "closed_at";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260920232745_trip_close_office_authorship';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_close_office_authorship journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
