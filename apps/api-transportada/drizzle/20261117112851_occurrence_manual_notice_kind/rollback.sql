-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 343 T1: devolve o aviso manual ao molde da 324 (só ocorrência de nota, com FK).
--
-- ⚠️ Só com aprovação humana. Recusa-se a rodar com aviso de parada gravado: sem a coluna não há como distinguir de
-- qual tabela o `occurrence_id` veio, e a FK de volta falharia.
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  stop_notices integer;
BEGIN
  SELECT count(*) INTO stop_notices FROM "occurrence_contractor_manual_notices" WHERE "occurrence_kind" <> 'document';
  IF stop_notices > 0 THEN
    RAISE EXCEPTION 'occurrence_contractor_manual_notices has % stop notices; refusing to restore the spec 324 foreign key', stop_notices;
  END IF;
END
$$;

ALTER TABLE "occurrence_contractor_manual_notices" DROP CONSTRAINT "occurrence_contractor_manual_notices_kind_check";
ALTER TABLE "occurrence_contractor_manual_notices" DROP COLUMN "occurrence_kind";
ALTER TABLE "occurrence_contractor_manual_notices" ADD CONSTRAINT "occurrence_contractor_manual_notices_company_occurrence_fk" FOREIGN KEY ("company_id","occurrence_id") REFERENCES "trip_document_occurrences"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261117112851_occurrence_manual_notice_kind';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one occurrence_manual_notice_kind journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
