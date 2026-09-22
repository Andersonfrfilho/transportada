-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz a spec 166 (RF1/RF2/RF3): as colunas `quantity`/`quantity_unit` de
-- `trip_document_occurrence_products` (com os três CHECKs) e a coluna `allows_multiple_items` de
-- `company_occurrence_types`.
--
-- O que se perde: a quantidade e a unidade gravadas em qualquer item de ocorrência, e o interruptor
-- de multi-item de qualquer tipo cadastrado. As duas colunas são aditivas e opcionais/com padrão —
-- nenhuma outra tabela depende delas.

BEGIN;

ALTER TABLE "trip_document_occurrence_products" DROP CONSTRAINT "trip_document_occurrence_products_quantity_unit_check";

ALTER TABLE "trip_document_occurrence_products" DROP CONSTRAINT "trip_document_occurrence_products_quantity_positive_check";

ALTER TABLE "trip_document_occurrence_products" DROP CONSTRAINT "trip_document_occurrence_products_quantity_presence_check";

ALTER TABLE "trip_document_occurrence_products" DROP COLUMN "quantity_unit";

ALTER TABLE "trip_document_occurrence_products" DROP COLUMN "quantity";

ALTER TABLE "company_occurrence_types" DROP COLUMN "allows_multiple_items";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260922192409_quantity_and_multi_item_occurrence'
      AND "hash" = 'acfdc0fcff53c117ba3a34ccd6c69193eb741c6103ac14170f38671de5fbfa70';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one quantity_and_multi_item_occurrence migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
