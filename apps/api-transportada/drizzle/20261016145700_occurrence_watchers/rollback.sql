-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Remove as duas listas de responsáveis e a coluna `cc_addresses` de `contractor_mail_messages`.
-- ⚠️ Perde a configuração das listas e o registro das cópias já enviadas. Recusa rodar com lista gravada: exporte antes.
-- Confira antes: select count(*) from company_occurrence_watchers; select count(*) from contractor_occurrence_watchers;
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  recorded_watchers integer;
BEGIN
  SELECT (SELECT count(*) FROM "company_occurrence_watchers")
       + (SELECT count(*) FROM "contractor_occurrence_watchers")
    INTO recorded_watchers;

  IF recorded_watchers > 0 THEN
    RAISE EXCEPTION 'Refusing to roll back: % occurrence watcher row(s) would be lost', recorded_watchers;
  END IF;
END
$$;

DROP TABLE "contractor_occurrence_watchers";
DROP TABLE "company_occurrence_watchers";
ALTER TABLE "contractor_mail_messages" DROP COLUMN "cc_addresses";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261016145700_occurrence_watchers';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one occurrence_watchers journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
