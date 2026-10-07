-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 237 T1.2 (ADR-0094): apaga `contractor_receiving_profiles`.
-- ⚠️ Os perfis cadastrados se perdem com a tabela: confira antes se algum está em uso
-- (select company_id, contractor_id from contractor_receiving_profiles where is_enabled).
BEGIN;

DROP TABLE IF EXISTS "contractor_receiving_profiles";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261003170340_contractor_receiving_profiles';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one contractor_receiving_profiles journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
