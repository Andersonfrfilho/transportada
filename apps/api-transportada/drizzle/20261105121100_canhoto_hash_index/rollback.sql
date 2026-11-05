-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 294 T3.3: remove o índice do hash do canhoto.
BEGIN;

SET LOCAL lock_timeout = '3s';

DROP INDEX "stored_objects_company_sha256_delivery_proof_idx";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261105121100_canhoto_hash_index';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one canhoto_hash_index journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
