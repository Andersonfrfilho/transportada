-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz a spec 246 T1c.1: `photo_minimum_count` e `items_minimum_count` do tipo, e as três colunas
-- novas das duas exceções (`items_mode`, `photo_minimum_count`, `items_minimum_count`), com as CHECKs
-- que as leem. Ordem inversa da migration: as CHECKs caem primeiro, depois as colunas.
--
-- NÃO toca `items_mode` do tipo nem as duas CHECKs dele (`company_occurrence_types_items_mode_check`,
-- `company_occurrence_types_items_off_shape_check`): são da spec 241, que está em produção.
--
-- O que se perde: a quantidade mínima de fotos e de produtos gravada no cadastro, e o `items_mode`
-- declarado em exceção. Preço aceito de um rollback, registrado no plan.md da 246.

BEGIN;

ALTER TABLE "company_occurrence_types"
  DROP CONSTRAINT IF EXISTS "company_occurrence_types_items_minimum_shape_check",
  DROP CONSTRAINT IF EXISTS "company_occurrence_types_items_minimum_count_check",
  DROP CONSTRAINT IF EXISTS "company_occurrence_types_photo_minimum_count_check";

ALTER TABLE "company_occurrence_type_recipient_overrides"
  DROP CONSTRAINT IF EXISTS "occurrence_type_recipient_overrides_items_minimum_shape_check",
  DROP CONSTRAINT IF EXISTS "occurrence_type_recipient_overrides_items_minimum_count_check",
  DROP CONSTRAINT IF EXISTS "occurrence_type_recipient_overrides_photo_minimum_count_check",
  DROP CONSTRAINT IF EXISTS "occurrence_type_recipient_overrides_items_mode_check";

ALTER TABLE "company_occurrence_type_contractor_overrides"
  DROP CONSTRAINT IF EXISTS "occurrence_type_contractor_overrides_items_minimum_shape_check",
  DROP CONSTRAINT IF EXISTS "occurrence_type_contractor_overrides_items_minimum_count_check",
  DROP CONSTRAINT IF EXISTS "occurrence_type_contractor_overrides_photo_minimum_count_check",
  DROP CONSTRAINT IF EXISTS "occurrence_type_contractor_overrides_items_mode_check";

ALTER TABLE "company_occurrence_type_recipient_overrides"
  DROP COLUMN IF EXISTS "items_minimum_count",
  DROP COLUMN IF EXISTS "photo_minimum_count",
  DROP COLUMN IF EXISTS "items_mode";

ALTER TABLE "company_occurrence_type_contractor_overrides"
  DROP COLUMN IF EXISTS "items_minimum_count",
  DROP COLUMN IF EXISTS "photo_minimum_count",
  DROP COLUMN IF EXISTS "items_mode";

ALTER TABLE "company_occurrence_types"
  DROP COLUMN IF EXISTS "items_minimum_count",
  DROP COLUMN IF EXISTS "photo_minimum_count";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261006205209_occurrence_type_quantity_minimums';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one occurrence_type_quantity_minimums journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
