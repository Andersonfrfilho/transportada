-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Never execute this file from application startup.
-- If fiscal XML was persisted, prefer roll-forward preservation over data rollback.
BEGIN;

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
  WHERE "name" = '20260722024645_boring_leper_queen'
    AND "hash" = '4e5e8e6d8980c129277b245c09aba14d1ac08dc09e8e12bdc1ac7fbd51996dfe';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one NF-e import migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

DROP TABLE "processed_messages";
DROP TABLE "processing_outbox";
DROP TABLE "nfe_distribution_cursors";
DROP TABLE "nfe_events";
DROP TABLE "nfe_products";
DROP TABLE "nfe_volumes";
DROP TABLE "nfe_addresses";
DROP TABLE "nfe_participants";
DROP TABLE "nfe_documents";
DROP TABLE "nfe_import_items";
DROP TABLE "nfe_imports";
DROP TABLE "stored_objects";

COMMIT;
