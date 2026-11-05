-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 294 T2.1: remove a coluna e a tabela de sugestões e volta os CHECKs de fonte. Falha de propósito se já existir coordenada com source 'driver' (corrija-as antes).
BEGIN;

SET LOCAL lock_timeout = '3s';

ALTER TABLE "client_delivery_addresses" DROP CONSTRAINT "client_delivery_addresses_source_check",
  ADD CONSTRAINT "client_delivery_addresses_source_check" CHECK ("source" in ('manual', 'google', 'postal_code', 'city'));
ALTER TABLE "geocoded_address_corrections" DROP CONSTRAINT "geocoded_address_corrections_new_source_check",
  ADD CONSTRAINT "geocoded_address_corrections_new_source_check" CHECK ("new_source" in ('manual', 'google', 'postal_code', 'city'));
ALTER TABLE "geocoded_address_corrections" DROP CONSTRAINT "geocoded_address_corrections_previous_source_check",
  ADD CONSTRAINT "geocoded_address_corrections_previous_source_check" CHECK ("previous_source" is null or "previous_source" in ('manual', 'google', 'postal_code', 'city'));
ALTER TABLE "geocoded_addresses" DROP CONSTRAINT "geocoded_addresses_source_check",
  ADD CONSTRAINT "geocoded_addresses_source_check" CHECK ("source" in ('manual', 'google', 'postal_code', 'city'));

DROP TABLE "address_correction_suggestions";

ALTER TABLE "trip_stop_events" DROP COLUMN "recorded_together";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261105023931_stop_event_recorded_together_and_address_suggestions';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one stop_event_recorded_together_and_address_suggestions journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
