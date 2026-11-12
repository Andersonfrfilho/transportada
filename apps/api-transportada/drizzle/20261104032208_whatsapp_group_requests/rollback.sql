-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 292 T4: remove os pedidos do grupo do motorista e o tempo limite deles. Pedidos e mensagens gravados se perdem.
BEGIN;

SET LOCAL lock_timeout = '3s';

DROP TABLE "whatsapp_group_request_messages";
DROP TABLE "whatsapp_group_requests";
ALTER TABLE "whatsapp_evolution_settings" DROP CONSTRAINT "whatsapp_evolution_settings_group_request_timeout_check";
ALTER TABLE "whatsapp_evolution_settings" DROP COLUMN "group_request_timeout_seconds";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261104032208_whatsapp_group_requests';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one whatsapp_group_requests journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
