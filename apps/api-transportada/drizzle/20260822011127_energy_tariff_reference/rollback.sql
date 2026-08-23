-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Derruba a tarifa homologada da ANEEL e a escolha de distribuidora de cada empresa.
-- A escolha sai antes da referência: ela é que aponta para a concessionária, ainda que por código.
BEGIN;

DROP TABLE IF EXISTS "company_energy_settings";

DROP TABLE IF EXISTS "energy_tariff_references";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260822011127_energy_tariff_reference'
      AND "hash" = '0852a04732b51a7d0dca4e29afcfaeaa77c7a9eb12c06729297aed8b312afeea';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one energy_tariff_reference migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
