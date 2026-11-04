-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 292 T1: remove a tabela do grupo de WhatsApp do motorista. Os vinculos gravados se perdem.
BEGIN;

SET LOCAL lock_timeout = '3s';

DROP TABLE "fleet_driver_whatsapp_groups";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261104002917_driver_whatsapp_groups';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one driver_whatsapp_groups journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
