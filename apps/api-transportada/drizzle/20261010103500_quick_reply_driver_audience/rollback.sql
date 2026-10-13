-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz o público `driver_reply` das respostas rápidas (Spec 263 D11). Sem CASCADE.
-- ⚠️ Recusa rodar enquanto existir resposta do público `driver_reply`: restaurar o CHECK antigo falharia
-- nessas linhas, e apagá-las perderia texto que a empresa cadastrou.
-- Confira antes: select count(*) from company_quick_replies where audience = 'driver_reply';

BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  driver_reply_rows integer;
BEGIN
  SELECT count(*) INTO driver_reply_rows
    FROM "company_quick_replies" WHERE "audience" = 'driver_reply';

  IF driver_reply_rows > 0 THEN
    RAISE EXCEPTION 'respostas do motorista existem; decidir antes de reverter (driver_reply: %)',
      driver_reply_rows;
  END IF;
END
$$;

ALTER TABLE "company_quick_replies" DROP CONSTRAINT "company_quick_replies_audience_check";
ALTER TABLE "company_quick_replies" ADD CONSTRAINT "company_quick_replies_audience_check"
  CHECK ("audience" in ('contractor', 'driver'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261010103500_quick_reply_driver_audience';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one quick_reply_driver_audience journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
