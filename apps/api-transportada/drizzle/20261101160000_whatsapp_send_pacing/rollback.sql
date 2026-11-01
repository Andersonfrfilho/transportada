-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 289: volta o padrão do teto a 50 e remove a vaga de envio. Os tetos já gravados em 300 ficam como estão.
BEGIN;

SET LOCAL lock_timeout = '3s';

ALTER TABLE "whatsapp_evolution_settings" ALTER COLUMN "daily_cap" SET DEFAULT 50;
ALTER TABLE "whatsapp_evolution_settings" DROP COLUMN "next_send_at";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261101160000_whatsapp_send_pacing';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one whatsapp_send_pacing journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
