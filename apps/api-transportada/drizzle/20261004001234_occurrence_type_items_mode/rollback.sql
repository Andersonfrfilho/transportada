-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz a spec 241 (RF1, RF2, RF11): a coluna `items_mode` de `company_occurrence_types`, com as duas
-- CHECKs que a leem. Ordem inversa da migration: a CHECK da forma cai primeiro, depois a de
-- vocabulário, e só então a coluna.
--
-- O que se perde: a escolha `off` feita no cadastro. A política de reentrega que a migration zerou na
-- segunda via **não** volta — era `unset` em tipo de catálogo (preço aceito no plan.md da 241).

BEGIN;

ALTER TABLE "company_occurrence_types"
  DROP CONSTRAINT IF EXISTS "company_occurrence_types_items_off_shape_check";

ALTER TABLE "company_occurrence_types"
  DROP CONSTRAINT IF EXISTS "company_occurrence_types_items_mode_check";

ALTER TABLE "company_occurrence_types" DROP COLUMN IF EXISTS "items_mode";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261004001234_occurrence_type_items_mode';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one occurrence_type_items_mode journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
