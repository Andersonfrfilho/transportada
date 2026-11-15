-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 326: tira os parâmetros do orçamento de frete. Recusa se alguma empresa já gravou os seus.
BEGIN;

DO $$
DECLARE
  saved_settings integer;
BEGIN
  SELECT count(*) INTO saved_settings FROM "company_freight_quote_settings";
  IF saved_settings > 0 THEN
    RAISE EXCEPTION 'company freight quote settings exist (% rows); refusing to drop the spec 326 table',
      saved_settings;
  END IF;
END
$$;

DROP TABLE "company_freight_quote_settings";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261115050000_freight_quote_settings';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one freight_quote_settings journal entry, removed %', deleted_migrations;
  END IF;
END
$$;

COMMIT;
