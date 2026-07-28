-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverts the IBGE municipality code of every NF-e participant address. Purely additive
-- migration — the column is nullable and no constraint or index depends on it.
-- Destructive: cMunIni/cMunFim of the CT-e are built from this column, so dropping it
-- forces a reimport of the original XML to recover the code. Export nfe_addresses
-- (id, city_code) before running.
BEGIN;

ALTER TABLE "nfe_addresses" DROP COLUMN "city_code";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260727151037_nfe_address_city_code'
      AND "hash" = '4280bdec60348b2574ac0d56457ba7631ed47f4d3f1fc2bcd79ec379670f458f';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one nfe_address_city_code migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
