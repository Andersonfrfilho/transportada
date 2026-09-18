-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 157 T11 (item 8): o índice parcial que serve o expurgo da posição da foto. Só DDL
-- de índice — o expurgo continua correto sem ele, só varre mais.
BEGIN;

DROP INDEX IF EXISTS "trip_delivery_proofs_located_created_at_idx";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260918140500_delivery_proof_location_purge_index';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one delivery_proof_location_purge_index journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
