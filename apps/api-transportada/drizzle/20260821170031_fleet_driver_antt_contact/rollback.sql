-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Retira o contato e o registro da ANTT da ficha do motorista. Perde o que foi digitado nos quatro
-- campos — nenhum deles é derivável do resto da linha.
BEGIN;

ALTER TABLE "fleet_drivers" DROP CONSTRAINT IF EXISTS "fleet_drivers_antt_category_check";
ALTER TABLE "fleet_drivers" DROP CONSTRAINT IF EXISTS "fleet_drivers_rntrc_check";
ALTER TABLE "fleet_drivers" DROP CONSTRAINT IF EXISTS "fleet_drivers_email_check";
ALTER TABLE "fleet_drivers" DROP CONSTRAINT IF EXISTS "fleet_drivers_linked_legal_name_check";

ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "antt_category";
ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "rntrc";
ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "email";
ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "linked_legal_name";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260821170031_fleet_driver_antt_contact'
      AND "hash" = '0a6a10a924366dc7c171d3f1719332c8904c06d6d36375207a1d5b0c1dc3e70f';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one fleet_driver_antt_contact migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
