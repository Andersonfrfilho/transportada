-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Retira da ficha do motorista o endereço da empresa do agregado — o do CNPJ, não o de quem dirige.
-- Perde o que foi digitado: o endereço da empresa não é derivável do resto da linha.
BEGIN;

ALTER TABLE "fleet_drivers" DROP CONSTRAINT IF EXISTS "fleet_drivers_linked_address_length_check";

ALTER TABLE "fleet_drivers" DROP CONSTRAINT IF EXISTS "fleet_drivers_linked_state_check";

ALTER TABLE "fleet_drivers" DROP CONSTRAINT IF EXISTS "fleet_drivers_linked_postal_code_check";

ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "linked_state";

ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "linked_city";

ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "linked_district";

ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "linked_complement";

ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "linked_number";

ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "linked_street";

ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "linked_postal_code";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260824004030_fleet_driver_linked_address'
      AND "hash" = 'f4a3e01ea1c4c6fa064009ee9ce7cc9357eeb66e778e9ffd9866befbba2f0c3f';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one fleet_driver_linked_address migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
