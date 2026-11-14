-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 325 T7.3: remove a preferência de canal dos lembretes de vencimento por pessoa.
--
-- ⚠️ Só com aprovação humana. Recusa-se a rodar quando houver preferência gravada: apagar a escolha de alguém faria o
-- aviso voltar só por e-mail sem que a pessoa saiba. Trate cada caso antes.
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  preferences integer;
BEGIN
  SELECT count(*) INTO preferences FROM "company_expense_reminder_preferences";
  IF preferences > 0 THEN
    RAISE EXCEPTION 'reminder preferences exist (% rows); refusing to drop the spec 325 T7.3 schema', preferences;
  END IF;
END
$$;

DROP TABLE "company_expense_reminder_preferences";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261114004108_company_expense_reminder_preferences';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one company_expense_reminder_preferences journal entry, removed %', deleted_migrations;
  END IF;
END
$$;

COMMIT;
