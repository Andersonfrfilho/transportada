-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz o ícone do tipo de ocorrência: a CHECK cai primeiro, depois a coluna. Sem CASCADE.
-- Não toca nenhuma outra coluna nem CHECK de `company_occurrence_types`.
--
-- O que se perde: o ícone escolhido em cada tipo; os tipos voltam a aparecer só com o nome.

BEGIN;

ALTER TABLE "company_occurrence_types"
  DROP CONSTRAINT IF EXISTS "company_occurrence_types_icon_name_check";

ALTER TABLE "company_occurrence_types"
  DROP COLUMN IF EXISTS "icon_name";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261008024137_occurrence_type_icon';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one occurrence_type_icon journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
