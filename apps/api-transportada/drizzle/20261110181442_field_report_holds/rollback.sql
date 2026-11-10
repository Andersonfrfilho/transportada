-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 320: remove as tabelas dos relatos retidos do app do motorista e do interruptor por empresa.
--
-- ⚠️ Só com aprovação humana. Recusa-se a rodar com relato retido ainda por decidir: apagar a tabela perderia
-- o que o motorista fez na rua e o escritório ainda não liberou nem descartou.
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  pending_holds integer;
BEGIN
  SELECT count(*) INTO pending_holds FROM "trip_field_report_holds" WHERE "state" = 'held';
  IF pending_holds > 0 THEN
    RAISE EXCEPTION 'trip_field_report_holds has % held rows; refusing to drop', pending_holds;
  END IF;
END
$$;

DROP TABLE "trip_field_report_holds";
DROP TABLE "company_field_report_hold_settings";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261110181442_field_report_holds';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one field_report_holds journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
