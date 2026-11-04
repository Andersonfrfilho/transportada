-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 293 T15: remove as entregas em preparo pelo WhatsApp. As preparações abertas se perdem (as fotos pendentes ficam no bucket, sem referência).
BEGIN;

SET LOCAL lock_timeout = '3s';

DROP TABLE "whatsapp_delivery_preparations";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261104133105_whatsapp_delivery_preparations';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one whatsapp_delivery_preparations journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
