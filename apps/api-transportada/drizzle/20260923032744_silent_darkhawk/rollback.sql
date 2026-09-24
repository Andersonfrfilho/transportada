-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz a spec 172 (RF1): a unidade de `trip_document_occurrence_products.quantity_unit` volta a
-- ser a lista fechada `unit`/`box` (CHECK) e a coluna volta a `varchar(8)`.
--
-- O que se perde: qualquer linha gravada com uma unidade comercial da nota (fora de `unit`/`box`)
-- vira valor que o CHECK antigo recusaria — não há linha dessas antes desta migration, mas uma
-- gravada depois dela e antes do rollback quebraria a constraint restaurada. Aditiva na ida,
-- portanto não perde dado nenhum ao ser desfeita sobre o estado anterior a ela.

BEGIN;

ALTER TABLE "trip_document_occurrence_products" DROP CONSTRAINT "trip_document_occurrence_products_quantity_unit_check", ADD CONSTRAINT "trip_document_occurrence_products_quantity_unit_check" CHECK ("quantity_unit" is null or "quantity_unit" in ('box', 'unit'));

ALTER TABLE "trip_document_occurrence_products" ALTER COLUMN "quantity_unit" SET DATA TYPE varchar(8) USING "quantity_unit"::varchar(8);

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260923032744_silent_darkhawk'
      AND "hash" = '2b7e1ba84f4d199d7f7c800c05aef8e0321b4c94ad52cc3c078a8cd02451e651';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one silent_darkhawk migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
