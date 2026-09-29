-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 218 RF-B5: tira a FK e a coluna `occurrence_type_id` de `trip_stop_occurrences`, a
-- coluna `flow` de `company_occurrence_types`.
--
-- ⚠️ Os 5 tipos por empresa que a migration inseriu (`flow = 'stop'`) NÃO são apagados aqui, de
-- propósito: são cadastros legítimos que um operador pode ter editado (nome, attachment_mode)
-- entre o deploy e um rollback tardio — apagar arriscaria remover um tipo em uso. Ficam órfãos
-- (sem coluna `flow` para distingui-los, já que a coluna some), mas continuam íntegros como
-- `company_occurrence_types` comuns; quem quiser tirá-los da tela marca `active = false` à mão.
BEGIN;

ALTER TABLE "trip_stop_occurrences"
  DROP CONSTRAINT IF EXISTS "trip_stop_occurrences_company_occurrence_type_fk";

ALTER TABLE "trip_stop_occurrences" DROP COLUMN IF EXISTS "occurrence_type_id";

ALTER TABLE "company_occurrence_types"
  DROP CONSTRAINT IF EXISTS "company_occurrence_types_flow_check";

ALTER TABLE "company_occurrence_types" DROP COLUMN IF EXISTS "flow";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260929131715_occurrence_stop_flow';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one occurrence_stop_flow journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
