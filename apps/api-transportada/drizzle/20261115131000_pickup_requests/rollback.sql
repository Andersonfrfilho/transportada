-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 339: tira a tabela de pedidos de coleta/entrega. Recusa se já existir algum pedido.
BEGIN;

DO $$
DECLARE
  saved_requests integer;
BEGIN
  SELECT count(*) INTO saved_requests FROM "pickup_requests";
  IF saved_requests > 0 THEN
    RAISE EXCEPTION 'pickup requests exist (% rows); refusing to drop the spec 339 table',
      saved_requests;
  END IF;
END
$$;

DROP TABLE "pickup_requests";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261115131000_pickup_requests';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one pickup_requests journal entry, removed %', deleted_migrations;
  END IF;
END
$$;

COMMIT;
