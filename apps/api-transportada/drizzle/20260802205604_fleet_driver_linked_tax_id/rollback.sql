-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverts the linked company tax id kept beside the driver CPF.
-- Destructive: dropping the column discards the CNPJ each autonomous driver invoices through.
BEGIN;

ALTER TABLE "fleet_drivers" DROP CONSTRAINT IF EXISTS "fleet_drivers_linked_tax_id_check";

ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "linked_tax_id";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260802205604_fleet_driver_linked_tax_id'
      AND "hash" = 'ba9e1b8db0935c47991e881560fab90a1e7a6606c25c6958cca699d724d19540';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one fleet_driver_linked_tax_id migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
