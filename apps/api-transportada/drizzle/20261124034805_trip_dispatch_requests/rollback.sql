-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Remove a tabela dos pedidos de despacho do bot. Os pedidos abertos e o histórico se perdem; as viagens, não.
BEGIN;

SET LOCAL lock_timeout = '3s';

DROP TABLE "trip_dispatch_requests";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261124034805_trip_dispatch_requests';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_dispatch_requests journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
