-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverts the CT-e batch item composition: the NF-e bound to each projected CT-e item
-- and the frozen charge breakdown of that item. Purely additive migration — cte_batch_items
-- and cte_batches were not altered, so the drop is self-contained. Never with CASCADE.
-- Destructive to every multi-document batch created after the migration: without
-- cte_batch_item_documents a batch keeps only the single nfe_document_id of its item,
-- and the charge breakdown is lost outright. Export cte_batch_item_documents and
-- cte_batch_item_charges before running.
BEGIN;

DROP TABLE "cte_batch_item_charges";
DROP TABLE "cte_batch_item_documents";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260727133210_cte_batch_item_composition'
      AND "hash" = '0234f0580deb7cc9379b5072cce0a79bcb0b8194f5e09da26fe401cc5bd6464a';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one cte_batch_item_composition migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
