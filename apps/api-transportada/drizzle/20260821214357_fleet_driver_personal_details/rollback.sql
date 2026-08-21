-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Retira da ficha do motorista a nacionalidade, a naturalidade, a filiação e o local de emissão da
-- CNH. Perde o que foi digitado — nenhum dos sete campos é derivável do resto da linha.
BEGIN;

ALTER TABLE "fleet_drivers" DROP CONSTRAINT IF EXISTS "fleet_drivers_personal_length_check";

ALTER TABLE "fleet_drivers" DROP CONSTRAINT IF EXISTS "fleet_drivers_license_issued_state_check";

ALTER TABLE "fleet_drivers" DROP CONSTRAINT IF EXISTS "fleet_drivers_birth_state_check";

ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "license_issued_state";

ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "license_issued_city";

ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "mother_name";

ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "father_name";

ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "birth_state";

ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "birth_city";

ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "nationality";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260821214357_fleet_driver_personal_details'
      AND "hash" = '0e401fcb7a4db8a97de344b772963023b362987443d6f130cc86ac2808df2167';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one fleet_driver_personal_details migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
