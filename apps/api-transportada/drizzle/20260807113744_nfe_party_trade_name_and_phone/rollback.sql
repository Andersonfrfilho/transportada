-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverts the trade name of the NF-e participant and the phone of its address.
-- Destructive: xFant and fone of the CT-e are built from these columns, so dropping them
-- forces a reimport of the original XML to recover the values. Export nfe_participants
-- (id, trade_name) and nfe_addresses (id, phone) before running.
BEGIN;

ALTER TABLE "nfe_participants" DROP COLUMN "trade_name";

ALTER TABLE "nfe_addresses" DROP COLUMN "phone";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260807113744_nfe_party_trade_name_and_phone'
      AND "hash" = 'dcb54eb6aa8097765169b81cc730d70bf0b187fe8ed53d6b629cd40af17b8b24';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one nfe_party_trade_name_and_phone migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
