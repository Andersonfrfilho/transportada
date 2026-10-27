-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 279 T1: remove `delivery_client_emails`. Recusa rodar com e-mail guardado: o cadastro é do cliente e não se
-- reconstrói. Exporte antes.
-- Confira antes: select count(*) from delivery_client_emails;
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  recorded_emails integer;
BEGIN
  SELECT count(*) FROM "delivery_client_emails" INTO recorded_emails;

  IF recorded_emails > 0 THEN
    RAISE EXCEPTION 'rollback recusado: % e-mail(s) do cliente seriam perdidos (spec 279)', recorded_emails;
  END IF;
END
$$;

DROP TABLE "delivery_client_emails";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261026193116_delivery_client_emails';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one delivery_client_emails journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
