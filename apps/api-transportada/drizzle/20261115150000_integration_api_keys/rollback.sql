-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 340: remove as chaves de integração e a coluna que liga o pedido de coleta à chave.
--
-- ⚠️ Recusa quando há chave cadastrada (apagar a chave de um integrador em produção o derruba sem aviso)
-- ou pedido de coleta feito por integração (a coluna é o que o liga à chave que o fez).
BEGIN;

DO $$
DECLARE
  key_rows bigint;
  linked_requests bigint;
BEGIN
  SELECT count(*) INTO key_rows FROM "integration_api_keys";
  IF key_rows > 0 THEN
    RAISE EXCEPTION 'Refusing rollback: integration_api_keys has % row(s)', key_rows;
  END IF;
  SELECT count(*) INTO linked_requests FROM "pickup_requests" WHERE "integration_key_id" IS NOT NULL;
  IF linked_requests > 0 THEN
    RAISE EXCEPTION 'Refusing rollback: % pickup request(s) were made through an integration key', linked_requests;
  END IF;
END
$$;

DROP INDEX "pickup_requests_integration_key_idx";
ALTER TABLE "pickup_requests" DROP COLUMN "integration_key_id";
DROP TABLE "integration_api_keys";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261115150000_integration_api_keys';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one integration_api_keys journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
