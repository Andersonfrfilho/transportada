-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 159 T11 (decisão D1): o corte de ativação da nota do motorista. As linhas de
-- fábrica que a migration criou em `company_delivery_proof_settings` ficam — elas têm os mesmos
-- valores que a ausência de linha já significava (ADR-0057 §4), então não há o que desfazer nelas.
BEGIN;

ALTER TABLE "company_delivery_proof_settings" DROP COLUMN "score_effective_since";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260918140400_driver_score_effective_since';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one driver_score_effective_since journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
