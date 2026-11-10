-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 316: remove o vendedor da contratante, a ligação às contratantes e a carteira.
--
-- ⚠️ Só com aprovação humana. Recusa-se a rodar com vendedor cadastrado: apagar as tabelas perderia a carteira que o
-- escritório montou.
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  registered integer;
BEGIN
  SELECT count(*) INTO registered FROM "contractor_salespeople";
  IF registered > 0 THEN
    RAISE EXCEPTION 'contractor_salespeople has % rows; refusing to drop the spec 316 tables', registered;
  END IF;
END
$$;

DROP TABLE "contractor_salesperson_clients";
DROP TABLE "contractor_salesperson_links";
DROP TABLE "contractor_salespeople";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261110191104_salespeople';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one salespeople journal entry, removed %', deleted_migrations;
  END IF;
END
$$;

COMMIT;
