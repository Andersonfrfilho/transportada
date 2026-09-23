-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz a spec 179 T102 (RF1): a coluna `attachment_mode` de `company_occurrence_types`, com o
-- CHECK do seu vocabulário.
--
-- O que se perde: a exigência de comprovante de todo tipo cadastrado. A coluna é aditiva e nasce
-- com padrão (`'off'`) — nenhuma outra tabela depende dela.

BEGIN;

ALTER TABLE "company_occurrence_types" DROP CONSTRAINT "company_occurrence_types_attachment_mode_check";

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
