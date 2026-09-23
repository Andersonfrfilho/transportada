-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz a spec 179 T102 (RF1/RF9): as colunas `attachment_mode` e `returns_to_depot` de
-- `company_occurrence_types`, com o CHECK do vocabulário de `attachment_mode`.
--
-- O que se perde: a exigência de comprovante e a marca de devolução ao barracão de todo tipo
-- cadastrado. As duas colunas são aditivas e nascem com padrão (`'off'`/`false`) — nenhuma outra
-- tabela depende delas.

BEGIN;

ALTER TABLE "company_occurrence_types" DROP CONSTRAINT "company_occurrence_types_attachment_mode_check";

ALTER TABLE "company_occurrence_types" DROP COLUMN "returns_to_depot";

ALTER TABLE "company_occurrence_types" DROP COLUMN "attachment_mode";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260923204855_company_occurrence_type_attachment_mode';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one company_occurrence_type_attachment_mode migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
