-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Safe only while no nfe_documents row has status 'unsigned' or a null
-- authorization_protocol. If such rows exist, correct by roll-forward instead.
BEGIN;

DO $$
DECLARE
  deleted_migrations integer;
  unsigned_rows integer;
BEGIN
  SELECT count(*) INTO unsigned_rows
    FROM "nfe_documents"
    WHERE "status" = 'unsigned' OR "authorization_protocol" IS NULL;
  IF unsigned_rows <> 0 THEN
    RAISE EXCEPTION 'Cannot roll back: % nfe_documents rows depend on the expanded domain', unsigned_rows;
  END IF;

  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260724115644_unsigned_nfe_document_expand'
      AND "hash" = 'bcdf1044127aa911e15f5605f88a64a174c8fd3e069d2c6ec5f1c920d1e58dad';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one unsigned nfe document migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

ALTER TABLE "nfe_documents"
  DROP CONSTRAINT "nfe_documents_status_check",
  ADD CONSTRAINT "nfe_documents_status_check" CHECK ("status" in ('authorized', 'cancelled', 'denied'));

ALTER TABLE "nfe_documents"
  DROP CONSTRAINT "nfe_documents_authorization_protocol_presence_check";

ALTER TABLE "nfe_documents"
  ALTER COLUMN "authorization_protocol" SET NOT NULL;

COMMIT;
